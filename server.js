const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";


/* =========================================================
   FILES
========================================================= */

const usersFile =
    path.join(
        __dirname,
        "users.json"
    );

const messagesFile =
    path.join(
        __dirname,
        "messages.json"
    );

const channelsFile =
    path.join(
        __dirname,
        "channels.json"
    );

const channelPostsFile =
    path.join(
        __dirname,
        "channel-posts.json"
    );


/* =========================================================
   CREATE FILES
========================================================= */

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


if (!fs.existsSync(channelsFile)) {

    fs.writeFileSync(
        channelsFile,
        "[]",
        "utf8"
    );
}


if (!fs.existsSync(channelPostsFile)) {

    fs.writeFileSync(
        channelPostsFile,
        "[]",
        "utf8"
    );
}


/* =========================================================
   JSON HELPERS
========================================================= */

function readJSON(file) {

    try {

        return JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    } catch {

        return [];
    }
}


function saveJSON(
    file,
    data
) {

    fs.writeFileSync(
        file,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );
}


function readUsers() {

    return readJSON(
        usersFile
    );
}


function saveUsers(users) {

    saveJSON(
        usersFile,
        users
    );
}


function readMessages() {

    return readJSON(
        messagesFile
    );
}


function saveMessages(messages) {

    saveJSON(
        messagesFile,
        messages
    );
}


function readChannels() {

    return readJSON(
        channelsFile
    );
}


function saveChannels(channels) {

    saveJSON(
        channelsFile,
        channels
    );
}


function readChannelPosts() {

    return readJSON(
        channelPostsFile
    );
}


function saveChannelPosts(posts) {

    saveJSON(
        channelPostsFile,
        posts
    );
}


/* =========================================================
   USERS
========================================================= */

function normalizeUser(user) {

    if (
        !Array.isArray(
            user.friends
        )
    ) {

        user.friends = [];
    }


    if (
        !user.profile ||
        typeof user.profile !==
        "object"
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

    normalizeUser(
        user
    );


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


/* =========================================================
   CHANNELS
========================================================= */

function normalizeChannel(channel) {

    if (
        !Array.isArray(
            channel.subscribers
        )
    ) {

        channel.subscribers = [];
    }


    return channel;
}


/* =========================================================
   HTTP HELPERS
========================================================= */

function getBody(req) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

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
                            JSON.parse(
                                body
                            )
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
        JSON.stringify(
            data
        )
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


    if (
        !fs.existsSync(
            filePath
        )
    ) {

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


    res.end(
        html
    );
}


/* =========================================================
   WEBSOCKET
========================================================= */

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


    try {

        client.send(
            JSON.stringify(
                data
            )
        );

        return true;

    } catch {

        return false;
    }
}


/* =========================================================
   HTTP SERVER
========================================================= */

const server =
    http.createServer(
        async (
            req,
            res
        ) => {

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


            /* =================================================
               MAIN PAGE
            ================================================= */

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


            /* =================================================
               REGISTER
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/register"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const login =
                        String(
                            body.login ||
                            ""
                        )
                            .trim();


                    const password =
                        String(
                            body.password ||
                            ""
                        )
                            .trim();


                    if (
                        !login ||
                        !password
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

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
                                success:
                                    false,

                                message:
                                    "Такой пользователь уже существует"
                            }
                        );

                        return;
                    }


                    const newUser = {

                        login,

                        password,

                        friends: [],

                        profile: {

                            name: "",

                            about: "",

                            photo: "",

                            messageStyle:
                                "classic"
                        }
                    };


                    users.push(
                        newUser
                    );


                    saveUsers(
                        users
                    );


                    /*
                        ВАЖНО:

                        Теперь после регистрации
                        сервер сразу отдаёт
                        пользователя клиенту.
                    */

                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            message:
                                "Аккаунт создан",

                            user:
                                publicUser(
                                    newUser
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
                            success:
                                false,

                            message:
                                "Ошибка регистрации"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               LOGIN
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/login"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const login =
                        String(
                            body.login ||
                            ""
                        )
                            .trim();


                    const password =
                        String(
                            body.password ||
                            ""
                        )
                            .trim();


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
                                success:
                                    false,

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
                            success:
                                false,

                            message:
                                "Ошибка входа"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               SEARCH USERS
            ================================================= */

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


            /* =================================================
               PROFILE GET
            ================================================= */

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
                            success:
                                false,

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


            /* =================================================
               PROFILE SAVE
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/profile"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const login =
                        String(
                            body.login ||
                            ""
                        )
                            .trim();


                    const name =
                        String(
                            body.name ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                40
                            );


                    const about =
                        String(
                            body.about ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                200
                            );


                    const photo =
                        String(
                            body.photo ||
                            ""
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
                                success:
                                    false,

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
                        ) ||
                        photo.startsWith(
                            "http://"
                        ) ||
                        photo.startsWith(
                            "https://"
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
                            success:
                                false,

                            message:
                                "Ошибка сохранения профиля"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               FRIENDS GET
            ================================================= */

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


            /* =================================================
               FRIENDS ACTION
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/friends"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const from =
                        String(
                            body.from ||
                            ""
                        )
                            .trim();


                    const to =
                        String(
                            body.to ||
                            ""
                        )
                            .trim();


                    const action =
                        String(
                            body.action ||
                            ""
                        )
                            .trim();


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
                                success:
                                    false,

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
                                .includes(
                                    to
                                )
                        ) {

                            userA.friends
                                .push(
                                    to
                                );
                        }


                        if (
                            !userB.friends
                                .includes(
                                    from
                                )
                        ) {

                            userB.friends
                                .push(
                                    from
                                );
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
                                success:
                                    false,

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
                            success:
                                false,

                            message:
                                "Ошибка работы с друзьями"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               CHATS
            ================================================= */

            if (
                req.method === "GET" &&
                pathname === "/chats"
            ) {

                const login =
                    url.searchParams.get(
                        "login"
                    ) || "";


                if (!login) {

                    sendJSON(
                        res,
                        []
                    );

                    return;
                }


                const users =
                    readUsers();


                users.forEach(
                    normalizeUser
                );


                const messages =
                    readMessages();


                const chatLogins =
                    new Set();


                messages.forEach(
                    message => {

                        if (
                            message.from ===
                            login
                        ) {

                            chatLogins.add(
                                message.to
                            );
                        }


                        if (
                            message.to ===
                            login
                        ) {

                            chatLogins.add(
                                message.from
                            );
                        }
                    }
                );


                const result =
                    Array.from(
                        chatLogins
                    )
                        .map(
                            otherLogin => {

                                const user =
                                    users.find(
                                        item =>
                                            item.login ===
                                            otherLogin
                                    );


                                if (!user) {
                                    return null;
                                }


                                const conversation =
                                    messages.filter(
                                        message =>
                                            (
                                                message.from ===
                                                    login &&
                                                message.to ===
                                                    otherLogin
                                            ) ||
                                            (
                                                message.from ===
                                                    otherLogin &&
                                                message.to ===
                                                    login
                                            )
                                    );


                                const messageCount =
                                    conversation.filter(
                                        message =>
                                            message.from ===
                                            otherLogin
                                    ).length;


                                const lastMessage =
                                    conversation[
                                        conversation.length - 1
                                    ];


                                return {

                                    login:
                                        otherLogin,

                                    user:
                                        publicUser(
                                            user,
                                            login
                                        ),

                                    messageCount,

                                    totalMessages:
                                        conversation.length,

                                    lastMessage:
                                        lastMessage
                                            ? lastMessage.text
                                            : "",

                                    lastTime:
                                        lastMessage
                                            ? lastMessage.time
                                            : ""

                                };
                            }
                        )
                        .filter(
                            Boolean
                        )
                        .sort(
                            (
                                a,
                                b
                            ) => {

                                return (
                                    new Date(
                                        b.lastTime ||
                                        0
                                    ) -
                                    new Date(
                                        a.lastTime ||
                                        0
                                    )
                                );
                            }
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


            /* =================================================
               SEND MESSAGE
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/send-message"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const from =
                        String(
                            body.from ||
                            ""
                        )
                            .trim();


                    const to =
                        String(
                            body.to ||
                            ""
                        )
                            .trim();


                    const text =
                        String(
                            body.text ||
                            ""
                        )
                            .trim();


                    if (
                        !from ||
                        !to ||
                        !text
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

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
                                success:
                                    false,

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
                            Date.now() +
                            Math.random(),

                        from,

                        to,

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


                    sendToUser(
                        to,
                        {
                            type:
                                "new-message",

                            message
                        }
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

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
                            success:
                                false,

                            message:
                                "Ошибка отправки сообщения"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               GET MESSAGES
            ================================================= */

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


            /* =================================================
               CHANNELS GET
            ================================================= */

            if (
                req.method === "GET" &&
                pathname === "/channels"
            ) {

                const login =
                    url.searchParams.get(
                        "login"
                    ) || "";


                const channels =
                    readChannels();


                const posts =
                    readChannelPosts();


                const users =
                    readUsers();


                channels.forEach(
                    normalizeChannel
                );


                const result =
                    channels.map(
                        channel => {

                            const channelPosts =
                                posts.filter(
                                    post =>
                                        post.channelId ===
                                        channel.id
                                );


                            const lastPost =
                                channelPosts[
                                    channelPosts.length - 1
                                ];


                            return {

                                ...channel,

                                subscribed:
                                    channel.subscribers
                                        .includes(
                                            login
                                        ),

                                postCount:
                                    channelPosts.length,

                                lastTime:
                                    lastPost
                                        ? lastPost.time
                                        : channel.createdAt

                            };
                        }
                    );


                saveChannels(
                    channels
                );


                sendJSON(
                    res,
                    result
                );

                return;
            }


            /* =================================================
               CHANNEL CREATE
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/channels"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const owner =
                        String(
                            body.owner ||
                            ""
                        )
                            .trim();


                    const name =
                        String(
                            body.name ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                60
                            );


                    const description =
                        String(
                            body.description ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                300
                            );


                    if (
                        !owner ||
                        !name
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Введите название канала"
                            }
                        );

                        return;
                    }


                    const users =
                        readUsers();


                    const userExists =
                        users.some(
                            user =>
                                user.login ===
                                owner
                        );


                    if (!userExists) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Пользователь не найден"
                            }
                        );

                        return;
                    }


                    const channels =
                        readChannels();


                    const channel = {

                        id:
                            "channel_" +
                            Date.now() +
                            "_" +
                            Math.random()
                                .toString(
                                    36
                                )
                                .slice(
                                    2,
                                    8
                                ),

                        name,

                        description,

                        owner,

                        subscribers:
                            [owner],

                        createdAt:
                            new Date()
                                .toISOString()
                    };


                    channels.push(
                        channel
                    );


                    saveChannels(
                        channels
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            channel
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                false,

                            message:
                                "Ошибка создания канала"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               CHANNEL SUBSCRIPTION
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/channel-subscription"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const channelId =
                        String(
                            body.channelId ||
                            ""
                        )
                            .trim();


                    const login =
                        String(
                            body.login ||
                            ""
                        )
                            .trim();


                    const action =
                        String(
                            body.action ||
                            ""
                        )
                            .trim();


                    const users =
                        readUsers();


                    const userExists =
                        users.some(
                            user =>
                                user.login ===
                                login
                        );


                    if (!userExists) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Пользователь не найден"
                            },
                            404
                        );

                        return;
                    }


                    const channels =
                        readChannels();


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                channelId
                        );


                    if (!channel) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Канал не найден"
                            },
                            404
                        );

                        return;
                    }


                    normalizeChannel(
                        channel
                    );


                    if (
                        action ===
                        "subscribe"
                    ) {

                        if (
                            !channel.subscribers
                                .includes(
                                    login
                                )
                        ) {

                            channel.subscribers
                                .push(
                                    login
                                );
                        }

                    } else if (
                        action ===
                        "unsubscribe"
                    ) {

                        /*
                            Создатель канала
                            не может отписаться
                            от собственного канала.
                        */

                        if (
                            channel.owner ===
                            login
                        ) {

                            sendJSON(
                                res,
                                {
                                    success:
                                        false,

                                    message:
                                        "Создатель не может отписаться от своего канала"
                                }
                            );

                            return;
                        }


                        channel.subscribers =
                            channel.subscribers.filter(
                                item =>
                                    item !==
                                    login
                            );

                    } else {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Неизвестное действие"
                            },
                            400
                        );

                        return;
                    }


                    saveChannels(
                        channels
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            subscribed:
                                channel.subscribers
                                    .includes(
                                        login
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
                            success:
                                false,

                            message:
                                "Ошибка подписки"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               CHANNEL POSTS GET
            ================================================= */

            if (
                req.method === "GET" &&
                pathname === "/channel-posts"
            ) {

                const channelId =
                    url.searchParams.get(
                        "channelId"
                    ) || "";


                const posts =
                    readChannelPosts();


                const users =
                    readUsers();


                const result =
                    posts
                        .filter(
                            post =>
                                post.channelId ===
                                channelId
                        )
                        .map(
                            post => {

                                const author =
                                    users.find(
                                        user =>
                                            user.login ===
                                            post.author
                                    );


                                return {

                                    ...post,

                                    authorUser:
                                        author
                                            ? publicUser(
                                                author
                                            )
                                            : {
                                                login:
                                                    post.author,

                                                name:
                                                    post.author,

                                                about:
                                                    "",

                                                photo:
                                                    ""
                                            }

                                };
                            }
                        );


                sendJSON(
                    res,
                    result
                );

                return;
            }


            /* =================================================
               CHANNEL POST
            ================================================= */

            if (
                req.method === "POST" &&
                pathname === "/channel-post"
            ) {

                try {

                    const body =
                        await getBody(
                            req
                        );


                    const channelId =
                        String(
                            body.channelId ||
                            ""
                        )
                            .trim();


                    const author =
                        String(
                            body.author ||
                            ""
                        )
                            .trim();


                    const text =
                        String(
                            body.text ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                10000
                            );


                    const media =
                        body.media || null;


                    const mediaType =
                        String(
                            body.mediaType ||
                            ""
                        );


                    if (
                        !channelId ||
                        !author
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Недостаточно данных"
                            }
                        );

                        return;
                    }


                    const channels =
                        readChannels();


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                channelId
                        );


                    if (!channel) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Канал не найден"
                            },
                            404
                        );

                        return;
                    }


                    normalizeChannel(
                        channel
                    );


                    if (
                        channel.owner !==
                        author
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Только владелец может публиковать посты"
                            },
                            403
                        );

                        return;
                    }


                    if (
                        !text &&
                        !media
                    ) {

                        sendJSON(
                            res,
                            {
                                success:
                                    false,

                                message:
                                    "Пустая публикация"
                            }
                        );

                        return;
                    }


                    const posts =
                        readChannelPosts();


                    const post = {

                        id:
                            Date.now() +
                            Math.random(),

                        channelId,

                        author,

                        text,

                        media,

                        mediaType,

                        time:
                            new Date()
                                .toISOString()
                    };


                    posts.push(
                        post
                    );


                    saveChannelPosts(
                        posts
                    );


                    /*
                        Уведомляем всех подписчиков,
                        которые сейчас онлайн.
                    */

                    channel.subscribers
                        .forEach(
                            subscriber => {

                                sendToUser(
                                    subscriber,
                                    {
                                        type:
                                            "new-channel-post",

                                        channelId,

                                        post
                                    }
                                );
                            }
                        );


                    sendJSON(
                        res,
                        {
                            success:
                                true,

                            post
                        }
                    );


                } catch (error) {

                    console.error(
                        error
                    );


                    sendJSON(
                        res,
                        {
                            success:
                                false,

                            message:
                                "Ошибка публикации"
                        },
                        500
                    );
                }


                return;
            }


            /* =================================================
               404
            ================================================= */

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

const wss =
    new WebSocketServer({
        server
    });


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


                    /* =========================================
                       AUTH
                    ========================================= */

                    if (
                        data.type ===
                        "auth"
                    ) {

                        const login =
                            String(
                                data.login ||
                                ""
                            )
                                .trim();


                        if (!login) {

                            socket.close();

                            return;
                        }


                        const users =
                            readUsers();


                        const exists =
                            users.some(
                                user =>
                                    user.login ===
                                    login
                            );


                        if (!exists) {

                            socket.close();

                            return;
                        }


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


                    if (
                        !authenticatedLogin
                    ) {

                        return;
                    }


                    /* =========================================
                       CALL
                    ========================================= */

                    if (
                        data.type ===
                        "call"
                    ) {

                        const to =
                            String(
                                data.to ||
                                ""
                            )
                                .trim();


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


                    /* =========================================
                       ANSWER
                    ========================================= */

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


                    /* =========================================
                       ICE
                    ========================================= */

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


                    /* =========================================
                       REJECT
                    ========================================= */

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


                    /* =========================================
                       HANGUP
                    ========================================= */

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


/* =========================================================
   START
========================================================= */

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