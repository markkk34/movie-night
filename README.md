# Вечер кино

Список фильмов и сериалов на двоих. React + Vite, Firebase (Auth + Firestore), хостинг на GitHub Pages.

## 1. Firebase

1. https://console.firebase.google.com → **Add project** (Google Analytics можно отключить). Тариф остаётся Spark, бесплатный.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** `ТВОЙ_НИК.github.io`. `localhost` там уже есть.
4. **Build → Firestore Database → Create database.** Регион `europe-west3` (Франкфурт), режим **Production** (не test mode).
5. Вкладка **Rules**: замени всё на текст ниже, подставь два своих Google-email и нажми **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in ["ТВОЙ@gmail.com", "ЕЁ@gmail.com"];
    }
  }
}
```

Эти правила и есть защита. Кто угодно может открыть сайт и войти через Google, но чужой аккаунт не получит ни одной записи.
Свои email храни только в консоли Firebase, в репозиторий их не коммить.

6. **Project settings (шестерёнка) → General → Your apps → Web (`</>`)** → зарегистрируй приложение. Скопируй объект `firebaseConfig` в `src/firebase.js`.
   Это не секрет, он всё равно виден в браузере.
7. Ограничение ключа: https://console.cloud.google.com → тот же проект → **APIs & Services → Credentials** → ключ "Browser key" → **Website restrictions** → добавь `https://ТВОЙ_НИК.github.io/*` и `http://localhost:5173/*`.
   (Если ограничить только github.io, локальный запуск перестанет работать, поэтому localhost оставь.)

## 2. GitHub

```bash
git init
git add .
git commit -m "Первый коммит"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/movie-night.git
git push -u origin main
```

1. Репозиторий создай на github.com заранее (пустой, без README). Он может быть публичным, потому что в нём нет ничего приватного.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. После пуша во вкладке **Actions** пройдёт деплой. Сайт будет на `https://ТВОЙ_НИК.github.io/movie-night/`.

## 3. Локальный запуск

```bash
npm install
npm run dev
```

## Как это работает

- Коллекция `items`: название, тип, категории, заметка, статус (`want` / `watching` / `done`), `addedBy`, `wants`, `expect`, `rating`. Оценки и отметки "хочу" хранятся по uid, так что у каждого свои.
- Коллекция `users`: uid → имя, чтобы показывать, кто что отметил.
- Партнёром считается второй человек, который вошёл в приложение. Для этого вам обоим нужно хотя бы раз зайти.
- Если вход идёт не с разрешённого email, приложение покажет "Нет доступа", потому что Firestore отклонит запросы.

## Если что-то не работает

- `auth/unauthorized-domain`: домен не добавлен в Authorized domains (шаг 3).
- "Нет доступа" под правильным аккаунтом: опечатка в email в правилах или правила не опубликованы.
- Белый экран на GitHub Pages: проверь, что в Settings → Pages выбран источник GitHub Actions.

## 4. Поиск фильмов через TMDB

1. Ключ: themoviedb.org → Settings → API → **API Key (v3 auth)**.
2. Вставь его в `src/tmdb.js` вместо `ВСТАВЬ_СЮДА_TMDB_API_KEY`.
3. Запушь. Ключ виден в браузере, это нормально: он бесплатный и только для чтения. По домену его ограничить нельзя.
4. По условиям TMDB нужна атрибуция. Текстовая уже есть внизу страницы, логотип можно взять на themoviedb.org/about/logos-attribution.
