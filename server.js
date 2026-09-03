=const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");

if (!fs.existsSync(usersFile)) {
fs.writeFileSync(usersFile, "[]", "utf8");
}

if (!fs.existsSync(messagesFile)) {
fs.writeFileSync(messagesFile, "[]", "utf8");
}

function readJSON(file) {
try {
return JSON.parse(
fs.readFileSync(file, "utf8")
);
} catch {
return [];
}
}

function writeJSON(file, data) {
fs.writeFileSync(
file,
JSON.stringify(data, null, 2),
"utf8"
);
}

function readUsers() {
return readJSON(usersFile);
}

function saveUsers(data) {
writeJSON(usersFile, data);
}

function readMessages() {
return readJSON(messagesFile);
}

function saveMessages(data) {
writeJSON(messagesFile, data);
}

function normalizeUser(user) {
if (!Array.isArray(user.friends)) {
user.friends = [];
}

```
if (!user.profile || typeof user.profile !== "object") {
    user.profile = {};
}

if (typeof user.profile.name !== "string") {
    user.profile.name = "";
}

if (typeof user.profile.about !== "string") {
    user.profile.about = "";
}

if (typeof user.profile.photo !== "string") {
    user.profile.photo = "";
}

if (typeof user.profile.messageStyle !== "string") {
    user.profile.messageStyle = "classic";
}

return user;
```

}

function publicUser(user, currentLogin = "") {
normalizeUser(user);

```
return {
    login: user.login,
    name: user.profile.name || user.login,
    about: user.profile.about || "",
    photo: user.profile.photo || "",
    messageStyle: user.profile.messageStyle || "classic",
    isFriend: user.friends.includes(currentLogin)
};
```

}

function getBody(req) {
return new Promise((resolve, reject) => {
let body = "";

```
    req.on("data", chunk => {
        body += chunk;

        if (
            Buffer.byteLength(body, "utf8") >
            12 * 1024 * 1024
        ) {
            reject(
                new Error("Request too large")
            );

            req.destroy();
        }
    });

    req.on("end", () => {
        if (!body) {
            resolve({});
            return;
        }

        try {
            resolve(JSON.parse(body));
        } catch {
            reject(
                new Error("Invalid JSON")
            );
        }
    });

    req.on("error", reject);
});
```

}

function sendJSON(
res,
data,
statusCode = 200
) {
res.writeHead(statusCode, {
"Content-Type":
"application/json; charset=utf-8",
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods":
"GET, POST, OPTIONS",
"Access-Control-Allow-Headers":
"Content-Type"
});

```
res.end(JSON.stringify(data));
```

}

function sendHTML(
res,
fileName
) {
const file =
path.join(__dirname, fileName);

```
if (!fs.existsSync(file)) {
    res.writeHead(404, {
        "Content-Type":
            "text/plain; charset=utf-8"
    });

    res.end("Страница не найдена");
    return;
}

res.writeHead(200, {
    "Content-Type":
        "text/html; charset=utf-8"
});

res.end(
    fs.readFileSync(
        file,
        "utf8"
    )
);
```

}

const server =
http.createServer(
async (req, res) => {

```
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type"
            });

            res.end();
            return;
        }

        const url =
            new URL(
                req.url,
                "http://localhost:" + PORT
            );

        const pathname =
            url.pathname;


        // =========================
        // СТРАНИЦЫ
        // =========================

        if (
            req.method === "GET" &&
            pathname === "/"
        ) {
            sendHTML(
                res,
                "index.html"
            );

            return;
        }

        if (
            req.method === "GET" &&
            pathname === "/register.html"
        ) {
            sendHTML(
                res,
                "register.html"
            );

            return;
        }


        // =========================
        // РЕГИСТРАЦИЯ
        // =========================

        if (
            req.method === "POST" &&
            pathname === "/register"
        ) {

            try {

                const body =
                    await getBody(req);

                const login =
                    String(
                        body.login || ""
                    ).trim();

                const password =
                    String(
                        body.password || ""
                    ).trim();

                if (!login || !password) {

                    sendJSON(res, {
                        success: false,
                        message:
                            "Заполни логин и пароль"
                    });

                    return;
                }

                const list =
                    readUsers();

                list.forEach(
                    normalizeUser
                );

                const exists =
                    list.some(
                        user =>
                            user.login.toLowerCase() ===
                            login.toLowerCase()
                    );

                if (exists) {

                    sendJSON(res, {
                        success: false,
                        message:
                            "Такой пользователь уже существует"
                    });

                    return;
                }

                list.push({
                    login: login,
                    password: password,
                    friends: [],
                    profile: {
                        name: "",
                        about: "",
                        photo: "",
                        messageStyle: "classic"
                    }
                });

                saveUsers(list);

                sendJSON(res, {
                    success: true,
                    message:
                        "Аккаунт создан"
                });

            } catch (error) {

                console.error(error);

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка регистрации"
                    },
                    500
                );
            }

            return;
        }


        // =========================
        // ВХОД
        // =========================

        if (
            req.method === "POST" &&
            pathname === "/login"
        ) {

            try {

                const body =
                    await getBody(req);

                const login =
                    String(
                        body.login || ""
                    ).trim();

                const password =
                    String(
                        body.password || ""
                    ).trim();

                const list =
                    readUsers();

                list.forEach(
                    normalizeUser
                );

                saveUsers(list);

                const user =
                    list.find(
                        item =>
                            item.login === login &&
                            item.password === password
                    );

                if (!user) {

                    sendJSON(res, {
                        success: false,
                        message:
                            "Неверный логин или пароль"
                    });

                    return;
                }

                sendJSON(res, {
                    success: true,
                    user:
                        publicUser(user)
                });

            } catch (error) {

                console.error(error);

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка входа"
                    },
                    500
                );
            }

            return;
        }


        // =========================
        // ПОИСК
        // =========================

        if (
            req.method === "GET" &&
            pathname === "/users"
        ) {

            const current =
                url.searchParams.get(
                    "current"
                ) || "";

            const query =
                (
                    url.searchParams.get(
                        "q"
                    ) || ""
                )
                    .trim()
                    .toLowerCase();

            const list =
                readUsers();

            list.forEach(
                normalizeUser
            );

            saveUsers(list);

            const result =
                list
                    .filter(
                        user =>
                            user.login !== current
                    )
                    .filter(user => {

                        if (!query) {
                            return true;
                        }

                        const login =
                            user.login.toLowerCase();

                        const name =
                            user.profile.name.toLowerCase();

                        const about =
                            user.profile.about.toLowerCase();

                        return (
                            login.includes(query) ||
                            name.includes(query) ||
                            about.includes(query)
                        );
                    })
                    .map(
                        user =>
                            publicUser(
                                user,
                                current
                            )
                    );

            sendJSON(
                res,
                result
            );

            return;
        }


        // =========================
        // ПРОФИЛЬ
        // =========================

        if (
            req.method === "GET" &&
            pathname === "/profile"
        ) {

            const login =
                url.searchParams.get(
                    "login"
                ) || "";

            const list =
                readUsers();

            const user =
                list.find(
                    item =>
                        item.login === login
                );

            if (!user) {

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Пользователь не найден"
                    },
                    404
                );

                return;
            }

            normalizeUser(user);

            sendJSON(res, {
                success: true,
                user:
                    publicUser(user)
            });

            return;
        }


        if (
            req.method === "POST" &&
            pathname === "/profile"
        ) {

            try {

                const body =
                    await getBody(req);

                const login =
                    String(
                        body.login || ""
                    ).trim();

                const name =
                    String(
                        body.name || ""
                    )
                        .trim()
                        .slice(0, 40);

                const about =
                    String(
                        body.about || ""
                    )
                        .trim()
                        .slice(0, 200);

                const photo =
                    String(
                        body.photo || ""
                    );

                const messageStyle =
                    String(
                        body.messageStyle ||
                        "classic"
                    );

                const list =
                    readUsers();

                const user =
                    list.find(
                        item =>
                            item.login === login
                    );

                if (!user) {

                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Пользователь не найден"
                        },
                        404
                    );

                    return;
                }

                normalizeUser(user);

                user.profile.name =
                    name;

                user.profile.about =
                    about;

                if (
                    photo === "" ||
                    photo.startsWith(
                        "data:image/"
                    )
                ) {
                    user.profile.photo =
                        photo;
                }

                if (
                    [
                        "classic",
                        "square",
                        "neon"
                    ].includes(
                        messageStyle
                    )
                ) {
                    user.profile.messageStyle =
                        messageStyle;
                }

                saveUsers(list);

                sendJSON(res, {
                    success: true,
                    message:
                        "Профиль сохранён",
                    user:
                        publicUser(user)
                });

            } catch (error) {

                console.error(error);

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка сохранения профиля"
                    },
                    500
                );
            }

            return;
        }


        // =========================
        // ДРУЗЬЯ
        // =========================

        if (
            req.method === "GET" &&
            pathname === "/friends"
        ) {

            const login =
                url.searchParams.get(
                    "login"
                ) || "";

            const list =
                readUsers();

            const current =
                list.find(
                    user =>
                        user.login === login
                );

            if (!current) {
                sendJSON(
                    res,
                    []
                );

                return;
            }

            normalizeUser(
                current
            );

            const result =
                list
                    .filter(
                        user =>
                            current.friends.includes(
                                user.login
                            )
                    )
                    .map(
                        user =>
                            publicUser(
                                user,
                                login
                            )
                    );

            sendJSON(
                res,
                result
            );

            return;
        }


        if (
            req.method === "POST" &&
            pathname === "/friends"
        ) {

            try {

                const body =
                    await getBody(req);

                const from =
                    String(
                        body.from || ""
                    ).trim();

                const to =
                    String(
                        body.to || ""
                    ).trim();

                const action =
                    String(
                        body.action || ""
                    ).trim();

                const list =
                    readUsers();

                const a =
                    list.find(
                        user =>
                            user.login === from
                    );

                const b =
                    list.find(
                        user =>
                            user.login === to
                    );

                if (
                    !a ||
                    !b ||
                    from === to
                ) {

                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Пользователь не найден"
                        },
                        404
                    );

                    return;
                }

                normalizeUser(a);
                normalizeUser(b);

                if (
                    action === "add"
                ) {

                    if (
                        !a.friends.includes(to)
                    ) {
                        a.friends.push(to);
                    }

                    if (
                        !b.friends.includes(from)
                    ) {
                        b.friends.push(from);
                    }

                } else if (
                    action === "remove"
                ) {

                    a.friends =
                        a.friends.filter(
                            x =>
                                x !== to
                        );

                    b.friends =
                        b.friends.filter(
                            x =>
                                x !== from
                        );

                } else {

                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Неизвестное действие"
                        },
                        400
                    );

                    return;
                }

                saveUsers(list);

                sendJSON(res, {
                    success: true
                });

            } catch (error) {

                console.error(error);

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка друзей"
                    },
                    500
                );
            }

            return;
        }


        // =========================
        // ОТПРАВКА СООБЩЕНИЯ
        // =========================

        if (
            req.method === "POST" &&
            pathname === "/send-message"
        ) {

            try {

                const body =
                    await getBody(req);

                const from =
                    String(
                        body.from || ""
                    ).trim();

                const to =
                    String(
                        body.to || ""
                    ).trim();

                const text =
                    String(
                        body.text || ""
                    ).trim();

                const list =
                    readUsers();

                if (
                    !list.some(
                        user =>
                            user.login === from
                    ) ||
                    !list.some(
                        user =>
                            user.login === to
                    )
                ) {

                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Пользователь не найден"
                        }
                    );

                    return;
                }

                if (!text) {

                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Пустое сообщение"
                        }
                    );

                    return;
                }

                const allMessages =
                    readMessages();

                const message = {
                    id: Date.now(),
                    from: from,
                    to: to,
                    text: text,
                    time:
                        new Date().toISOString()
                };

                allMessages.push(
                    message
                );

                saveMessages(
                    allMessages
                );

                sendJSON(res, {
                    success: true,
                    message:
                        message
                });

            } catch (error) {

                console.error(error);

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка отправки сообщения"
                    },
                    500
                );
            }

            return;
        }


        // =========================
        // СООБЩЕНИЯ
        // =========================

        if (
            req.method === "GET" &&
            pathname === "/messages"
        ) {

            const user1 =
                url.searchParams.get(
                    "user1"
                ) || "";

            const user2 =
                url.searchParams.get(
                    "user2"
                ) || "";

            const allMessages =
                readMessages();

            const result =
                allMessages.filter(
                    message =>
                        (
                            message.from === user1 &&
                            message.to === user2
                        )
                        ||
                        (
                            message.from === user2 &&
                            message.to === user1
                        )
                );

            sendJSON(
                res,
                result
            );

            return;
        }


        res.writeHead(
            404,
            {
                "Content-Type":
                    "text/plain; charset=utf-8"
            }
        );

        res.end(
            "Страница не найдена"
        );
    }
);
```

server.listen(
PORT,
HOST,
() => {
console.log(
"Vibe запущен. Порт: " +
PORT
);
}
);

