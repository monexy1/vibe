const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");


/* =========================
   FILES
========================= */

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(
        usersFile,
        "[]",
        "utf8"
    );
}

if (!fs.existsSync(messagesFile)) {
    fs.writeFileSync(
        messagesFile,
        "[]",
        "utf8"
    );
}


function readUsers() {

    try {

        return JSON.parse(
            fs.readFileSync(
                usersFile,
                "utf8"
            )
        );

    } catch {

        return [];
    }
}


function saveUsers(users) {

    fs.writeFileSync(
        usersFile,
        JSON.stringify(
            users,
            null,
            2
        ),
        "utf8"
    );
}


function readMessages() {

    try {

        return JSON.parse(
            fs.readFileSync(
                messagesFile,
                "utf8"
            )
        );

    } catch {

        return [];
    }
}


function saveMessages(messages) {

    fs.writeFileSync(
        messagesFile,
        JSON.stringify(
            messages,
            null,
            2
        ),
        "utf8"
    );
}


/* =========================
   USERS
========================= */

function normalizeUser(user) {

    if (!Array.isArray(user.friends)) {

        user.friends = [];
    }


    if (
        !user.profile ||
        typeof user.profile !== "object"
    ) {

        user.profile = {};
    }


    if (
        typeof user.profile.name !==
        "string"
    ) {

        user.profile.name = "";
    }


    if (
        typeof user.profile.about !==
        "string"
    ) {

        user.profile.about = "";
    }


    if (
        typeof user.profile.photo !==
        "string"
    ) {

        user.profile.photo = "";
    }


    if (
        typeof user.profile.messageStyle !==
        "string"
    ) {

        user.profile.messageStyle =
            "classic";
    }


    return user;
}


function publicUser(
    user,
    currentLogin = ""
) {

    normalizeUser(user);


    return {

        login:
            user.login,

        name:
            user.profile.name ||
            user.login,

        about:
            user.profile.about ||
            "",

        photo:
            user.profile.photo ||
            "",

        messageStyle:
            user.profile.messageStyle ||
            "classic",

        isFriend:
            user.friends.includes(
                currentLogin
            )
    };
}


/* =========================
   HTTP HELPERS
========================= */

function getBody(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body += chunk;


                    if (
                        Buffer.byteLength(
                            body,
                            "utf8"
                        ) >
                        12 * 1024 * 1024
                    ) {

                        reject(
                            new Error(
                                "Request too large"
                            )
                        );

                        req.destroy();
                    }
                }
            );


            req.on(
                "end",
                () => {

                    if (!body) {

                        resolve({});

                        return;
                    }


                    try {

                        resolve(
                            JSON.parse(body)
                        );

                    } catch {

                        reject(
                            new Error(
                                "Invalid JSON"
                            )
                        );
                    }
                }
            );


            req.on(
                "error",
                reject
            );
        }
    );
}


function sendJSON(
    res,
    data,
    statusCode = 200
) {

    res.writeHead(
        statusCode,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Access-Control-Allow-Origin":
                "*",

            "Access-Control-Allow-Methods":
                "GET, POST, OPTIONS",

            "Access-Control-Allow-Headers":
                "Content-Type"
        }
    );


    res.end(
        JSON.stringify(data)
    );
}


function sendHTML(
    res,
    fileName
) {

    const filePath =
        path.join(
            __dirname,
            fileName
        );


    if (!fs.existsSync(filePath)) {

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

        return;
    }


    const html =
        fs.readFileSync(
            filePath,
            "utf8"
        );


    res.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8"
        }
    );


    res.end(html);
}


/* =========================
   HTTP SERVER
========================= */

const server =
    http.createServer(
        async (req, res) => {

            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    {
                        "Access-Control-Allow-Origin":
                            "*",

                        "Access-Control-Allow-Methods":
                            "GET, POST, OPTIONS",

                        "Access-Control-Allow-Headers":
                            "Content-Type"
                    }
                );

                res.end();

                return;
            }


            const url =
                new URL(
                    req.url,
                    "http://localhost:" +
                    PORT
                );


            const pathname =
                url.pathname;


            /* =========================
               MAIN PAGES
            ========================= */

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


            /* =========================
               REGISTER
            ========================= */

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


                    if (
                        !login ||
                        !password
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Заполни логин и пароль"
                            }
                        );

                        return;
                    }


                    const users =
                        readUsers();


                    users.forEach(
                        normalizeUser
                    );


                    const exists =
                        users.some(
                            user =>
                                user.login
                                    .toLowerCase() ===
                                login
                                    .toLowerCase()
                        );


                    if (exists) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Такой пользователь уже существует"
                            }
                        );

                        return;
                    }


                    users.push({

                        login:
                            login,

                        password:
                            password,

                        friends:
                            [],

                        profile: {

                            name:
                                "",

                            about:
                                "",

                            photo:
                                "",

                            messageStyle:
                                "classic"
                        }
                    });


                    saveUsers(
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            message:
                                "Аккаунт создан"
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


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


            /* =========================
               LOGIN
            ========================= */

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


                    const users =
                        readUsers();


                    users.forEach(
                        normalizeUser
                    );


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                    login &&
                                item.password ===
                                    password
                        );


                    saveUsers(
                        users
                    );


                    if (!user) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Неверный логин или пароль"
                            }
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            user:
                                publicUser(
                                    user
                                )
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


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


            /* =========================
               USERS SEARCH
            ========================= */

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


                const users =
                    readUsers();


                users.forEach(
                    normalizeUser
                );


                const result =
                    users

                        .filter(
                            user =>
                                user.login !==
                                current
                        )

                        .filter(
                            user => {

                                if (!query) {
                                    return true;
                                }


                                const login =
                                    user.login
                                        .toLowerCase();


                                const name =
                                    user.profile.name
                                        .toLowerCase();


                                const about =
                                    user.profile.about
                                        .toLowerCase();


                                return (
                                    login.includes(
                                        query
                                    ) ||

                                    name.includes(
                                        query
                                    ) ||

                                    about.includes(
                                        query
                                    )
                                );
                            }
                        )

                        .map(
                            user =>
                                publicUser(
                                    user,
                                    current
                                )
                        );


                saveUsers(
                    users
                );


                sendJSON(
                    res,
                    result
                );

                return;
            }


            /* =========================
               PROFILE GET
            ========================= */

            if (
                req.method === "GET" &&
                pathname === "/profile"
            ) {

                const login =
                    url.searchParams.get(
                        "login"
                    ) || "";


                const users =
                    readUsers();


                const user =
                    users.find(
                        item =>
                            item.login ===
                            login
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


                normalizeUser(
                    user
                );


                sendJSON(
                    res,
                    {
                        success:
                            true,

                        user:
                            publicUser(
                                user
                            )
                    }
                );


                return;
            }


            /* =========================
               PROFILE SAVE
            ========================= */

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
                            .slice(
                                0,
                                40
                            );


                    const about =
                        String(
                            body.about || ""
                        )
                            .trim()
                            .slice(
                                0,
                                200
                            );


                    const photo =
                        String(
                            body.photo || ""
                        );


                    const messageStyle =
                        String(
                            body.messageStyle ||
                            "classic"
                        );


                    const users =
                        readUsers();


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                login
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


                    normalizeUser(
                        user
                    );


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


                    const allowedStyles =
                        [
                            "classic",
                            "square",
                            "neon"
                        ];


                    if (
                        allowedStyles.includes(
                            messageStyle
                        )
                    ) {

                        user.profile.messageStyle =
                            messageStyle;
                    }


                    saveUsers(
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            message:
                                "Профиль сохранён",

                            user:
                                publicUser(
                                    user
                                )
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


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


            /* =========================
               FRIENDS GET
            ========================= */

            if (
                req.method === "GET" &&
                pathname === "/friends"
            ) {

                const login =
                    url.searchParams.get(
                        "login"
                    ) || "";


                const users =
                    readUsers();


                const current =
                    users.find(
                        user =>
                            user.login ===
                            login
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
                    users

                        .filter(
                            user =>
                                current.friends
                                    .includes(
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


            /* =========================
               FRIENDS ACTION
            ========================= */

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


                    const users =
                        readUsers();


                    const userA =
                        users.find(
                            user =>
                                user.login ===
                                from
                        );


                    const userB =
                        users.find(
                            user =>
                                user.login ===
                                to
                        );


                    if (
                        !userA ||
                        !userB ||
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


                    normalizeUser(
                        userA
                    );

                    normalizeUser(
                        userB
                    );


                    if (
                        action ===
                        "add"
                    ) {

                        if (
                            !userA.friends
                                .includes(to)
                        ) {

                            userA.friends
                                .push(to);
                        }


                        if (
                            !userB.friends
                                .includes(from)
                        ) {

                            userB.friends
                                .push(from);
                        }

                    } else if (
                        action ===
                        "remove"
                    ) {

                        userA.friends =
                            userA.friends.filter(
                                login =>
                                    login !==
                                    to
                            );


                        userB.friends =
                            userB.friends.filter(
                                login =>
                                    login !==
                                    from
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


                    saveUsers(
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


                    sendJSON(
                        res,
                        {
                            success: false,
                            message:
                                "Ошибка работы с друзьями"
                        },
                        500
                    );
                }


                return;
            }


            /* =========================
               SEND MESSAGE
            ========================= */

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


                    if (
                        !from ||
                        !to ||
                        !text
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Недостаточно данных"
                            }
                        );

                        return;
                    }


                    const users =
                        readUsers();


                    const senderExists =
                        users.some(
                            user =>
                                user.login ===
                                from
                        );


                    const receiverExists =
                        users.some(
                            user =>
                                user.login ===
                                to
                        );


                    if (
                        !senderExists ||
                        !receiverExists
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


                    const messages =
                        readMessages();


                    const message = {

                        id:
                            Date.now(),

                        from:
                            from,

                        to:
                            to,

                        text:
                            text,

                        time:
                            new Date()
                                .toISOString()
                    };


                    messages.push(
                        message
                    );


                    saveMessages(
                        messages
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            message:
                                message
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


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


            /* =========================
               GET MESSAGES
            ========================= */

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


                const messages =
                    readMessages();


                const result =
                    messages.filter(
                        message =>
                            (
                                message.from ===
                                    user1 &&
                                message.to ===
                                    user2
                            ) ||
                            (
                                message.from ===
                                    user2 &&
                                message.to ===
                                    user1
                            )
                    );


                sendJSON(
                    res,
                    result
                );

                return;
            }


            /* =========================
               404
            ========================= */

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


/* =========================================================
   WEBSOCKET SERVER
========================================================= */

/*
    Здесь WebSocket используется только
    для передачи сигналов WebRTC.

    Сам звук/видео через сервер Vibe
    НЕ проходит.
*/

const wss =
    new WebSocketServer({
        server
    });


/*
    login -> WebSocket

    Например:

    monexy -> connection A
    user2  -> connection B
*/

const onlineUsers =
    new Map();


function sendToUser(
    login,
    data
) {

    const client =
        onlineUsers.get(
            login
        );


    if (
        !client ||
        client.readyState !== 1
    ) {

        return false;
    }


    client.send(
        JSON.stringify(
            data
        )
    );


    return true;
}


wss.on(
    "connection",
    socket => {

        let authenticatedLogin =
            "";


        console.log(
            "Новое WebSocket соединение"
        );


        socket.on(
            "message",
            raw => {

                try {

                    const data =
                        JSON.parse(
                            raw.toString()
                        );


                    if (
                        data.type ===
                        "auth"
                    ) {

                        const login =
                            String(
                                data.login ||
                                ""
                            ).trim();


                        if (!login) {

                            socket.close();

                            return;
                        }


                        /*
                            Если пользователь
                            уже был подключён,
                            закрываем старое
                            соединение.
                        */

                        const oldSocket =
                            onlineUsers.get(
                                login
                            );


                        if (
                            oldSocket &&
                            oldSocket !== socket
                        ) {

                            try {
                                oldSocket.close();
                            } catch {}
                        }


                        authenticatedLogin =
                            login;


                        onlineUsers.set(
                            login,
                            socket
                        );


                        socket.send(
                            JSON.stringify({
                                type:
                                    "auth-ok"
                            })
                        );


                        console.log(
                            "Пользователь онлайн:",
                            login
                        );


                        return;
                    }


                    /*
                        Пока пользователь
                        не авторизован через
                        WebSocket —
                        игнорируем сообщения.
                    */

                    if (
                        !authenticatedLogin
                    ) {

                        return;
                    }


                    /* =====================
                       CALL
                    ===================== */

                    if (
                        data.type ===
                        "call"
                    ) {

                        const to =
                            String(
                                data.to ||
                                ""
                            ).trim();


                        if (!to) {
                            return;
                        }


                        const users =
                            readUsers();


                        const receiver =
                            users.find(
                                user =>
                                    user.login ===
                                    to
                            );


                        if (!receiver) {

                            socket.send(
                                JSON.stringify({
                                    type:
                                        "call-rejected",

                                    reason:
                                        "Пользователь не найден"
                                })
                            );

                            return;
                        }


                        const delivered =
                            sendToUser(
                                to,
                                {
                                    type:
                                        "incoming-call",

                                    from:
                                        authenticatedLogin,

                                    video:
                                        !!data.video,

                                    offer:
                                        data.offer,

                                    name:
                                        String(
                                            data.name ||
                                            authenticatedLogin
                                        ),

                                    photo:
                                        String(
                                            data.photo ||
                                            ""
                                        )
                                }
                            );


                        if (!delivered) {

                            socket.send(
                                JSON.stringify({
                                    type:
                                        "call-rejected",

                                    reason:
                                        "Пользователь сейчас не в сети"
                                })
                            );
                        }


                        return;
                    }


                    /* =====================
                       ANSWER
                    ===================== */

                    if (
                        data.type ===
                        "answer"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "answer",

                                from:
                                    authenticatedLogin,

                                answer:
                                    data.answer
                            }
                        );

                        return;
                    }


                    /* =====================
                       ICE
                    ===================== */

                    if (
                        data.type ===
                        "ice-candidate"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "ice-candidate",

                                from:
                                    authenticatedLogin,

                                candidate:
                                    data.candidate
                            }
                        );

                        return;
                    }


                    /* =====================
                       REJECT
                    ===================== */

                    if (
                        data.type ===
                        "reject-call"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "call-rejected",

                                from:
                                    authenticatedLogin
                            }
                        );

                        return;
                    }


                    /* =====================
                       HANGUP
                    ===================== */

                    if (
                        data.type ===
                        "hangup"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "hangup",

                                from:
                                    authenticatedLogin
                            }
                        );

                        return;
                    }


                } catch (error) {

                    console.error(
                        "WebSocket message error:",
                        error
                    );
                }
            }
        );


        socket.on(
            "close",
            () => {

                if (
                    authenticatedLogin &&
                    onlineUsers.get(
                        authenticatedLogin
                    ) === socket
                ) {

                    onlineUsers.delete(
                        authenticatedLogin
                    );


                    console.log(
                        "Пользователь офлайн:",
                        authenticatedLogin
                    );
                }
            }
        );


        socket.on(
            "error",
            error => {

                console.log(
                    "WebSocket error:",
                    error
                );
            }
        );
    }
);


/* =========================
   START
========================= */

server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            "Vibe запущен. Порт: " +
            PORT
        );

        console.log(
            "WebSocket звонков готов."
        );
    }
);