const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

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
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function saveMessages(messages) {
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Неверный JSON"));
            }
        });
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

    // =========================
    // СТРАНИЦЫ
    // =========================

    if (req.method === "GET" && req.url === "/") {
        sendHTML(res, "index.html");
        return;
    }

    if (req.method === "GET" && req.url === "/register.html") {
        sendHTML(res, "register.html");
        return;
    }

    // =========================
    // РЕГИСТРАЦИЯ
    // =========================

    if (req.method === "POST" && req.url === "/register") {

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

            const exists = users.some(
                user => user.login.toLowerCase() === login.toLowerCase()
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
                password: password
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

    if (req.method === "POST" && req.url === "/login") {

        try {
            const body = await getBody(req);

            const login = String(body.login || "").trim();
            const password = String(body.password || "").trim();

            const users = readUsers();

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
    // ПОЛЬЗОВАТЕЛИ
    // =========================

    if (req.method === "GET" && req.url === "/users") {

        const users = readUsers();

        const safeUsers = users.map(user => ({
            login: user.login
        }));

        sendJSON(res, safeUsers);
        return;
    }

    // =========================
    // ОТПРАВКА СООБЩЕНИЯ
    // =========================

    if (req.method === "POST" && req.url === "/send-message") {

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

    if (req.method === "GET" && req.url.startsWith("/messages")) {

        try {
            const url = new URL(
                req.url,
                `http://localhost:${PORT}`
            );

            const user1 = url.searchParams.get("user1");
            const user2 = url.searchParams.get("user2");

            if (!user1 || !user2) {
                sendJSON(res, []);
                return;
            }

            const messages = readMessages();

            const chatMessages = messages.filter(message =>
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

server.listen(PORT, () => {
    console.log(`Vibe запущен: http://localhost:${PORT}`);
});