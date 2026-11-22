import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { auth, db, provider } from "./firebase";
import { posterUrl, searchTmdb } from "./tmdb";

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

  const add = ({ wantIt = true, ...data }) => addDoc(collection(db, "items"), {
    ...data, status: "want", wants: wantIt ? { [me]: true } : {},
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

      <AddForm onAdd={add} items={items} />

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
      <footer className="muted small">
        Данные о фильмах: <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>.
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </main>
  );
}

const norm = (s = "") => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const statusLabel = (it) => STATUSES.find(([k]) => k === (it.status || "want"))?.[1] || "";

// exact: тот же фильм из TMDB; иначе совпадение по названию (мягкое, ремейки бывают)
function findDup(items, r) {
  if (r.tmdbId) {
    const e = items.find((it) => it.tmdbId === r.tmdbId && it.type === r.type);
    if (e) return { item: e, exact: true };
  }
  const names = [r.title, r.originalTitle].filter(Boolean).map(norm);
  const s = items.find((it) => (!r.tmdbId || !it.tmdbId) &&
    [it.title, it.originalTitle].filter(Boolean).map(norm).some((n) => names.includes(n)));
  return s ? { item: s, exact: false } : null;
}

function AddForm({ onAdd, items }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [wantIt, setWantIt] = useState(true);

  useEffect(() => {
    const text = q.trim();
    if (draft || text.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchTmdb(text, ctrl.signal)
        .then((r) => { setResults(r); setFailed(false); })
        .catch((e) => { if (e.name !== "AbortError") setFailed(true); });
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, draft]);

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags || []))].sort(), [items]);
  const curTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const toggleTag = (t) => setTags((curTags.includes(t) ? curTags.filter((x) => x !== t) : [...curTags, t]).join(", "));
  const reset = () => { setQ(""); setDraft(null); setTags(""); setNote(""); setWantIt(true); setResults([]); };

  if (!draft) return (
    <section className="add">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти фильм или сериал по названию" />
      {failed && <p className="muted small">Поиск недоступен. Проверь ключ TMDB, а пока можно добавить вручную.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r) => {
            const d = findDup(items, r);
            return (
              <li key={`${r.type}${r.tmdbId}`}>
                <button type="button" disabled={d?.exact} onClick={() => setDraft(r)}>
                  {r.poster ? <img src={posterUrl(r.poster, "w92")} alt="" /> : <span className="noimg" />}
                  <span>
                    <b>{r.title}</b>
                    <span className="muted small"> {r.type === "series" ? "сериал" : "фильм"}{r.year && `, ${r.year}`}</span>
                    {r.originalTitle && r.originalTitle !== r.title && <span className="muted small block">{r.originalTitle}</span>}
                    {d?.exact && <span className="warn small block">Уже в списке: {statusLabel(d.item)}</span>}
                    {d && !d.exact && <span className="warn small block">Возможно, уже есть: «{d.item.title}»</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.trim().length > 1 && (
        <button type="button" onClick={() => setDraft({ title: q.trim(), type: "movie" })}>Добавить вручную «{q.trim()}»</button>
      )}
    </section>
  );

  const dup = findDup(items, draft);
  const submit = (e) => {
    e.preventDefault();
    if (!draft.title.trim() || dup?.exact) return;
    onAdd({ ...draft, title: draft.title.trim(), note: note.trim(), tags: curTags, wantIt });
    reset();
  };

  return (
    <form className="add" onSubmit={submit}>
      <div className="draft-head">
        {draft.poster && <img src={posterUrl(draft.poster, "w92")} alt="" />}
        <div className="grow">
          {draft.tmdbId ? (
            <>
              <b>{draft.title}</b>
              <span className="muted small"> {draft.type === "series" ? "сериал" : "фильм"}{draft.year && `, ${draft.year}`}</span>
              {draft.originalTitle && draft.originalTitle !== draft.title && <span className="muted small block">{draft.originalTitle}</span>}
            </>
          ) : (
            <div className="row wrap">
              <input className="grow" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                <option value="movie">Фильм</option><option value="series">Сериал</option>
              </select>
            </div>
          )}
        </div>
      </div>
      {dup && (
        <p className="warn small">
          {dup.exact ? "Этот фильм уже в списке" : "Похожая запись уже есть"}: «{dup.item.title}» ({statusLabel(dup.item)}).
          {!dup.exact && " Если это другой фильм (например, ремейк), можно добавить."}
        </p>
      )}
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Категории через запятую" />
      {allTags.length > 0 && (
        <div className="taglist">
          {allTags.map((t) => (
            <button type="button" key={t} className={curTags.includes(t) ? "on" : ""} onClick={() => toggleTag(t)}>{t}</button>
          ))}
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" />
      <label className="check">
        <input type="checkbox" checked={wantIt} onChange={(e) => setWantIt(e.target.checked)} /> Я хочу это посмотреть
      </label>
      <div className="row wrap">
        <button className="primary" disabled={dup?.exact}>Добавить</button>
        <button type="button" onClick={reset}>Отмена</button>
      </div>
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
    <article className={`card ${it.poster ? "has-poster" : ""}`}>
      {it.poster && <img className="poster" src={posterUrl(it.poster)} alt="" loading="lazy" />}
      <div className="main">
      <div className="row">
        <h2>{it.title}</h2>
        <span className="kind">{it.type === "series" ? "сериал" : "фильм"}{it.year ? `, ${it.year}` : ""}</span>
      </div>
      {it.tags?.length > 0 && <div className="tags">{it.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      {it.originalTitle && it.originalTitle !== it.title && <p className="muted small">{it.originalTitle}</p>}
      {it.overview && <details className="muted small"><summary>Описание</summary>{it.overview}</details>}
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
    </div>
    </article>
  );
}
