import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { auth, db, provider } from "./firebase";

const STATUSES = [["want", "Хотим посмотреть"], ["watching", "Смотрим"], ["done", "Посмотрели"]];

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState({});
  const [tab, setTab] = useState("want");
  const [filter, setFilter] = useState("all");

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  useEffect(() => {
    if (!user) return;
    setDenied(false);
    const fail = () => setDenied(true);
    setDoc(doc(db, "users", user.uid), { name: user.displayName || user.email }, { merge: true }).catch(fail);
    const offItems = onSnapshot(
      query(collection(db, "items"), orderBy("createdAt", "desc")),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))), fail);
    const offUsers = onSnapshot(collection(db, "users"),
      (s) => setUsers(Object.fromEntries(s.docs.map((d) => [d.id, d.data().name]))), fail);
    return () => { offItems(); offUsers(); };
  }, [user]);

  const me = user?.uid;
  const partner = Object.keys(users).find((id) => id !== me);
  const partnerName = users[partner] || "Партнёр";

  const shown = useMemo(() => items.filter((it) => {
    if ((it.status || "want") !== tab) return false;
    const a = !!it.wants?.[me], b = !!it.wants?.[partner];
    if (filter === "both") return a && b;
    if (filter === "me") return a && !b;
    if (filter === "partner") return b && !a;
    return true;
  }), [items, tab, filter, me, partner]);

  if (!ready) return <main className="shell" />;

  if (!user) return (
    <main className="shell center">
      <h1>Вечер кино</h1>
      <p className="muted">Список фильмов и сериалов на двоих.</p>
      <button className="primary" onClick={() => signInWithPopup(auth, provider)}>Войти через Google</button>
    </main>
  );

  if (denied) return (
    <main className="shell center">
      <h1>Нет доступа</h1>
      <p className="muted">Аккаунт {user.email} не добавлен в правила Firestore. Войди другим аккаунтом.</p>
      <button onClick={() => signOut(auth)}>Выйти</button>
    </main>
  );

  const add = (data) => addDoc(collection(db, "items"), {
    ...data, status: "want", wants: { [me]: true },
    addedBy: me, createdAt: serverTimestamp(),
  });
  const upd = (id, data) => updateDoc(doc(db, "items", id), data);

  return (
    <main className="shell">
      <header>
        <h1>Вечер кино</h1>
        <span className="muted">{user.displayName || user.email}</span>
        <button className="link" onClick={() => signOut(auth)}>Выйти</button>
      </header>

      <AddForm onAdd={add} />

      <nav className="tabs">
        {STATUSES.map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      <nav className="chips">
        {[["all", "Все"], ["both", "Хотим оба"], ["me", "Только я"], ["partner", `Только ${partnerName}`]].map(([k, label]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </nav>

      {shown.length === 0 && <p className="muted empty">Здесь пусто. Добавь первый фильм выше.</p>}
      {shown.map((it) => (
        <Item key={it.id} it={it} me={me} partner={partner} users={users}
          onUpdate={(d) => upd(it.id, d)} onDelete={() => deleteDoc(doc(db, "items", it.id))} />
      ))}
    </main>
  );
}

function AddForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("movie");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), type, note: note.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
    setTitle(""); setTags(""); setNote("");
  };
  return (
    <form className="add" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="movie">Фильм</option><option value="series">Сериал</option>
      </select>
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Категории через запятую" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" />
      <button className="primary">Добавить</button>
    </form>
  );
}

function Score({ label, field, it, me, partner, users, onUpdate }) {
  const mine = it[field]?.[me], theirs = it[field]?.[partner];
  return (
    <div className="score">
      <span className="muted">{label}</span>
      <span className="who me" title="Моя оценка" />
      <select value={mine || ""} onChange={(e) =>
        onUpdate({ [`${field}.${me}`]: e.target.value ? Number(e.target.value) : deleteField() })}>
        <option value="">—</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n}>{n}</option>)}
      </select>
      <span className="who partner" title={users[partner] || "Партнёр"} />
      <b>{theirs || "—"}</b>
    </div>
  );
}

function Item({ it, me, partner, users, onUpdate, onDelete }) {
  const status = it.status || "want";
  const wantMine = !!it.wants?.[me], wantTheirs = !!it.wants?.[partner];
  const toggleWant = () => onUpdate({ [`wants.${me}`]: wantMine ? deleteField() : true });
  const sc = { it, me, partner, users, onUpdate };
  return (
    <article className="card">
      <div className="row">
        <h2>{it.title}</h2>
        <span className="kind">{it.type === "series" ? "сериал" : "фильм"}</span>
      </div>
      {it.tags?.length > 0 && <div className="tags">{it.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      {it.note && <p className="note">{it.note}</p>}
      <p className="muted small">
        Добавил(а): <span className={`who ${it.addedBy === me ? "me" : "partner"}`} /> {users[it.addedBy] || "—"}
      </p>
      <div className="row wrap">
        <button className={`want ${wantMine ? "on" : ""}`} onClick={toggleWant}>
          <span className="who me" /> {wantMine ? "Я хочу" : "Не отмечено"}
        </button>
        <span className={`want ro ${wantTheirs ? "on" : ""}`}>
          <span className="who partner" /> {wantTheirs ? `${users[partner] || "Партнёр"} хочет` : "Не отмечено"}
        </span>
        <select value={status} onChange={(e) => onUpdate({ status: e.target.value })}>
          {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Score label="Ожидание" field="expect" {...sc} />
      {status === "done" && <Score label="Впечатление" field="rating" {...sc} />}
      <button className="link danger" onClick={() => confirm(`Удалить «${it.title}»?`) && onDelete()}>Удалить</button>
    </article>
  );
}
