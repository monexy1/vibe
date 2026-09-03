const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, "[]");
}

if (!fs.existsSync(messagesFile)) {
    fs.writeFileSync(messagesFile, "[]");
}

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch {
        return [];
    }
}

function readMessages() {
    try {
        return JSON.parse(fs.readFileSync(messagesFile, "utf8"));
    } catch {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(
        usersFile,
        JSON.stringify(users, null, 2)
    );
}

function saveMessages(messages) {
    fs.writeFileSync(
        messagesFile,
        JSON.stringify(messages, null, 2)
    );
}

function normalizeUser(user) {
    if (!Array.isArray(user.friends)) {
        user.friends = [];
    }

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
}

function getSafeUser(user, currentUser = "") {
    normalizeUser(user);

    return {
        login: user.login,
        name: user.profile.name || user.login,
        about: user.profile.about || "",
        photo: user.profile.photo || "",
        messageStyle: user.profile.messageStyle || "classic",
        isFriend: user.friends.includes(currentUser),
    };
}

function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        const MAX_SIZE = 10 * 1024 * 1024;

        req.on("data", chunk => {
            body += chunk;

            if (Buffer.byteLength(body, "utf8") > MAX_SIZE) {
                reject(new Error("Слишком большой запрос"));
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
                reject(new Error("Неверный JSON"));
            }
        });

        req.on("error", reject);
    });
}

function sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });

    res.end(JSON.stringify(data));
}

function sendHTML(res, filename) {
    const file = path.join(__dirname, filename);

    if (!fs.existsSync(file)) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Страница не найдена");
        return;
    }

    const html = fs.readFileSync(file, "utf8");

    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html);
}

const server = http.createServer(async (req, res) => {

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });

        res.end();
        return;
    }

    const url = new URL(
        req.url,
        `http://localhost:${PORT}`
    );

    const pathname = url.pathname;

    // =========================
    // СТРАНИЦЫ
    // =========================

    if (req.method === "GET" && pathname === "/") {
        sendHTML(res, "index.html");
        return;
    }

    if (req.method === "GET" && pathname === "/register.html") {
        sendHTML(res, "register.html");
        return;
    }

    // =========================
    // РЕГИСТРАЦИЯ
    // =========================

    if (req.method === "POST" && pathname === "/register") {

        try {
            const body = await getBody(req);

            const login = String(body.login || "").trim();
            const password = String(body.password || "").trim();

            if (!login || !password) {
                sendJSON(res, {
                    success: false,
                    message: "Заполни логин и пароль"
                });
                return;
            }

            const users = readUsers();

            users.forEach(normalizeUser);

            const exists = users.some(
                user =>
                    user.login.toLowerCase() === login.toLowerCase()
            );

            if (exists) {
                sendJSON(res, {
                    success: false,
                    message: "Такой пользователь уже существует"
                });
                return;
            }

            users.push({
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

            saveUsers(users);

            sendJSON(res, {
                success: true,
                message: "Аккаунт создан"
            });

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка регистрации"
            }, 500);
        }

        return;
    }

    // =========================
    // ВХОД
    // =========================

    if (req.method === "POST" && pathname === "/login") {

        try {
            const body = await getBody(req);

            const login = String(body.login || "").trim();
            const password = String(body.password || "").trim();

            const users = readUsers();

            users.forEach(normalizeUser);

            saveUsers(users);

            const user = users.find(
                item =>
                    item.login === login &&
                    item.password === password
            );

            if (!user) {
                sendJSON(res, {
                    success: false,
                    message: "Неверный логин или пароль"
                });
                return;
            }

            sendJSON(res, {
                success: true,
                message: "Вход выполнен"
            });

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка входа"
            }, 500);
        }

        return;
    }

    // =========================
    // ПОИСК ПОЛЬЗОВАТЕЛЕЙ
    // =========================

    if (req.method === "GET" && pathname === "/users") {

        const currentUser = url.searchParams.get("current") || "";
        const query = (url.searchParams.get("q") || "")
            .toLowerCase()
            .trim();

        const users = readUsers();

        users.forEach(normalizeUser);

        saveUsers(users);

        const result = users
            .filter(user => user.login !== currentUser)
            .filter(user => {

                if (!query) {
                    return true;
                }

                const login = user.login.toLowerCase();
                const name = user.profile.name.toLowerCase();
                const about = user.profile.about.toLowerCase();

                return (
                    login.includes(query) ||
                    name.includes(query) ||
                    about.includes(query)
                );
            })
            .map(user => getSafeUser(user, currentUser));

        sendJSON(res, result);
        return;
    }

    // =========================
    // ПРОФИЛЬ
    // =========================

    if (req.method === "GET" && pathname === "/profile") {

        const login = url.searchParams.get("login");

        if (!login) {
            sendJSON(res, {
                success: false,
                message: "Логин не указан"
            }, 400);
            return;
        }

        const users = readUsers();

        const user = users.find(
            item => item.login === login
        );

        if (!user) {
            sendJSON(res, {
                success: false,
                message: "Пользователь не найден"
            }, 404);
            return;
        }

        normalizeUser(user);

        sendJSON(res, {
            success: true,
            user: getSafeUser(user)
        });

        return;
    }

    if (req.method === "POST" && pathname === "/profile") {

        try {
            const body = await getBody(req);

            const login = String(body.login || "").trim();
            const name = String(body.name || "").trim();
            const about = String(body.about || "").trim();
            const photo = String(body.photo || "");
            const messageStyle =
                String(body.messageStyle || "classic");

            const users = readUsers();

            const user = users.find(
                item => item.login === login
            );

            if (!user) {
                sendJSON(res, {
                    success: false,
                    message: "Пользователь не найден"
                }, 404);
                return;
            }

            normalizeUser(user);

            user.profile.name = name.slice(0, 40);
            user.profile.about = about.slice(0, 200);

            if (
                photo === "" ||
                photo.startsWith("data:image/")
            ) {
                user.profile.photo = photo;
            }

            const allowedStyles = [
                "classic",
                "square",
                "neon"
            ];

            if (allowedStyles.includes(messageStyle)) {
                user.profile.messageStyle = messageStyle;
            }

            saveUsers(users);

            sendJSON(res, {
                success: true,
                message: "Профиль сохранён",
                user: getSafeUser(user)
            });

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка сохранения профиля"
            }, 500);
        }

        return;
    }

    // =========================
    // ДРУЗЬЯ
    // =========================

    if (req.method === "GET" && pathname === "/friends") {

        const login = url.searchParams.get("login");

        if (!login) {
            sendJSON(res, []);
            return;
        }

        const users = readUsers();

        const current = users.find(
            user => user.login === login
        );

        if (!current) {
            sendJSON(res, []);
            return;
        }

        normalizeUser(current);

        const friends = users
            .filter(user => current.friends.includes(user.login))
            .map(user => getSafeUser(user, login));

        sendJSON(res, friends);
        return;
    }

    if (req.method === "POST" && pathname === "/friends") {

        try {
            const body = await getBody(req);

            const from = String(body.from || "").trim();
            const to = String(body.to || "").trim();
            const action = String(body.action || "add").trim();

            if (!from || !to || from === to) {
                sendJSON(res, {
                    success: false,
                    message: "Неверные данные"
                }, 400);
                return;
            }

            const users = readUsers();

            const currentUser = users.find(
                user => user.login === from
            );

            const targetUser = users.find(
                user => user.login === to
            );

            if (!currentUser || !targetUser) {
                sendJSON(res, {
                    success: false,
                    message: "Пользователь не найден"
                }, 404);
                return;
            }

            normalizeUser(currentUser);
            normalizeUser(targetUser);

            if (action === "add") {

                if (!currentUser.friends.includes(to)) {
                    currentUser.friends.push(to);
                }

                if (!targetUser.friends.includes(from)) {
                    targetUser.friends.push(from);
                }

            } else if (action === "remove") {

                currentUser.friends =
                    currentUser.friends.filter(
                        login => login !== to
                    );

                targetUser.friends =
                    targetUser.friends.filter(
                        login => login !== from
                    );

            }

            saveUsers(users);

            sendJSON(res, {
                success: true,
                action: action
            });

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка работы с друзьями"
            }, 500);
        }

        return;
    }

    // =========================
    // ОТПРАВКА СООБЩЕНИЯ
    // =========================

    if (req.method === "POST" && pathname === "/send-message") {

        try {
            const body = await getBody(req);

            const from = String(body.from || "").trim();
            const to = String(body.to || "").trim();
            const text = String(body.text || "").trim();

            if (!from || !to || !text) {
                sendJSON(res, {
                    success: false,
                    message: "Недостаточно данных"
                });
                return;
            }

            const users = readUsers();

            const senderExists = users.some(
                user => user.login === from
            );

            const receiverExists = users.some(
                user => user.login === to
            );

            if (!senderExists || !receiverExists) {
                sendJSON(res, {
                    success: false,
                    message: "Пользователь не найден"
                });
                return;
            }

            const messages = readMessages();

            const newMessage = {
                id: Date.now(),
                from: from,
                to: to,
                text: text,
                time: new Date().toISOString()
            };

            messages.push(newMessage);

            saveMessages(messages);

            sendJSON(res, {
                success: true,
                message: newMessage
            });

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка отправки сообщения"
            }, 500);
        }

        return;
    }

    // =========================
    // СООБЩЕНИЯ
    // =========================

    if (req.method === "GET" && pathname === "/messages") {

        try {
            const user1 =
                url.searchParams.get("user1");

            const user2 =
                url.searchParams.get("user2");

            if (!user1 || !user2) {
                sendJSON(res, []);
                return;
            }

            const messages = readMessages();

            const chatMessages =
                messages.filter(message =>

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

            sendJSON(res, chatMessages);

        } catch {
            sendJSON(res, {
                success: false,
                message: "Ошибка получения сообщений"
            }, 500);
        }

        return;
    }

    // =========================
    // 404
    // =========================

    res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Страница не найдена");
});

server.listen(PORT, HOST, () => {
    console.log(
        `Vibe запущен на порту ${PORT}`
    );
});