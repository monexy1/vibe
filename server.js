const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const DATA_DIR = __dirname;

const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
const CHANNEL_POSTS_FILE = path.join(DATA_DIR, "channel-posts.json");


/* =========================================================
   FILE HELPERS
========================================================= */

function ensureFile(file, defaultValue = []) {

    if (!fs.existsSync(file)) {

        fs.writeFileSync(
            file,
            JSON.stringify(
                defaultValue,
                null,
                2
            ),
            "utf8"
        );
    }
}


ensureFile(
    USERS_FILE,
    []
);

ensureFile(
    MESSAGES_FILE,
    []
);

ensureFile(
    CHANNELS_FILE,
    []
);

ensureFile(
    CHANNEL_POSTS_FILE,
    []
);


function readJSON(file, fallback = []) {

    try {

        const data =
            fs.readFileSync(
                file,
                "utf8"
            );

        return JSON.parse(data);

    } catch (error) {

        console.error(
            "Ошибка чтения:",
            file,
            error
        );

        return fallback;
    }
}


function saveJSON(file, data) {

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
        USERS_FILE,
        []
    );
}


function saveUsers(users) {

    saveJSON(
        USERS_FILE,
        users
    );
}


function readMessages() {

    return readJSON(
        MESSAGES_FILE,
        []
    );
}


function saveMessages(messages) {

    saveJSON(
        MESSAGES_FILE,
        messages
    );
}


function readChannels() {

    const channels =
        readJSON(
            CHANNELS_FILE,
            []
        );

    return channels.map(
        normalizeChannel
    );
}


function saveChannels(channels) {

    saveJSON(
        CHANNELS_FILE,
        channels
    );
}


function readChannelPosts() {

    return readJSON(
        CHANNEL_POSTS_FILE,
        []
    );
}


function saveChannelPosts(posts) {

    saveJSON(
        CHANNEL_POSTS_FILE,
        posts
    );
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeUser(user) {

    if (!Array.isArray(user.friends)) {

        user.friends = [];
    }


    if (!user.profile) {

        user.profile = {};
    }


    if (
        typeof user.profile.name !==
        "string"
    ) {

        user.profile.name =
            user.login || "";
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


function normalizeChannel(channel) {

    if (
        !Array.isArray(
            channel.subscribers
        )
    ) {

        channel.subscribers = [];
    }


    if (
        typeof channel.name !==
        "string"
    ) {

        channel.name = "Канал";
    }


    if (
        typeof channel.description !==
        "string"
    ) {

        channel.description = "";
    }


    if (
        typeof channel.photo !==
        "string"
    ) {

        channel.photo = "";
    }


    if (!channel.settings) {

        channel.settings = {};
    }


    if (
        typeof channel.settings.comments !==
        "boolean"
    ) {

        channel.settings.comments = false;
    }


    if (
        typeof channel.settings.notifications !==
        "boolean"
    ) {

        channel.settings.notifications = true;
    }


    return channel;
}


/* =========================================================
   PUBLIC USER
========================================================= */

function publicUser(user) {

    if (!user) {
        return null;
    }


    user =
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
            "classic"

    };
}


/* =========================================================
   HTTP HELPERS
========================================================= */

function sendJSON(
    response,
    status,
    data
) {

    response.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Cache-Control":
                "no-store"
        }
    );


    response.end(
        JSON.stringify(
            data
        )
    );
}


function sendHTML(
    response,
    status,
    html
) {

    response.writeHead(
        status,
        {
            "Content-Type":
                "text/html; charset=utf-8"
        }
    );


    response.end(
        html
    );
}


function getBody(request) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            let body = "";

            let size = 0;

            const MAX_SIZE =
                20 *
                1024 *
                1024;


            request.on(
                "data",
                chunk => {

                    size +=
                        chunk.length;


                    if (
                        size >
                        MAX_SIZE
                    ) {

                        reject(
                            new Error(
                                "REQUEST_TOO_LARGE"
                            )
                        );

                        request.destroy();

                        return;
                    }


                    body +=
                        chunk.toString();
                }
            );


            request.on(
                "end",
                () => {

                    try {

                        resolve(
                            body
                                ? JSON.parse(
                                    body
                                )
                                : {}
                        );

                    } catch {

                        reject(
                            new Error(
                                "INVALID_JSON"
                            )
                        );
                    }
                }
            );


            request.on(
                "error",
                reject
            );
        }
    );
}


/* =========================================================
   SERVER
========================================================= */

const server =
    http.createServer(
        async (
            request,
            response
        ) => {

            const url =
                new URL(
                    request.url,
                    `http://${request.headers.host || "localhost"}`
                );


            const pathname =
                url.pathname;


            try {


                /* =================================================
                   INDEX
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/"
                ) {

                    const file =
                        path.join(
                            __dirname,
                            "index.html"
                        );


                    if (
                        !fs.existsSync(
                            file
                        )
                    ) {

                        sendHTML(
                            response,
                            404,
                            "index.html не найден"
                        );

                        return;
                    }


                    const html =
                        fs.readFileSync(
                            file,
                            "utf8"
                        );


                    sendHTML(
                        response,
                        200,
                        html
                    );

                    return;
                }


                /* =================================================
                   REGISTER
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/register"
                ) {

                    const body =
                        await getBody(
                            request
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
                        );


                    if (
                        !login ||
                        !password
                    ) {

                        sendJSON(
                            response,
                            400,
                            {
                                success:
                                    false,

                                message:
                                    "Заполните все поля"
                            }
                        );

                        return;
                    }


                    if (
                        login.length <
                        3
                    ) {

                        sendJSON(
                            response,
                            400,
                            {
                                success:
                                    false,

                                message:
                                    "Логин должен содержать минимум 3 символа"
                            }
                        );

                        return;
                    }


                    const users =
                        readUsers();


                    if (
                        users.some(
                            user =>
                                user.login
                                    .toLowerCase() ===
                                login.toLowerCase()
                        )
                    ) {

                        sendJSON(
                            response,
                            400,
                            {
                                success:
                                    false,

                                message:
                                    "Такой логин уже существует"
                            }
                        );

                        return;
                    }


                    const user = {

                        login,

                        password,

                        friends: [],

                        profile: {

                            name:
                                login,

                            about:
                                "",

                            photo:
                                "",

                            messageStyle:
                                "classic"
                        }
                    };


                    users.push(
                        user
                    );


                    saveUsers(
                        users
                    );


                    sendJSON(
                        response,
                        200,
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
                   LOGIN
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/login"
                ) {

                    const body =
                        await getBody(
                            request
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
                        );


                    const users =
                        readUsers();


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                    login &&
                                item.password ===
                                    password
                        );


                    if (!user) {

                        sendJSON(
                            response,
                            401,
                            {
                                success:
                                    false,

                                message:
                                    "Неверный логин или пароль"
                            }
                        );

                        return;
                    }


                    normalizeUser(
                        user
                    );


                    saveUsers(
                        users
                    );


                    sendJSON(
                        response,
                        200,
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
                   USERS
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/users"
                ) {

                    const current =
                        url.searchParams.get(
                            "current"
                        ) || "";


                    const q =
                        (
                            url.searchParams.get(
                                "q"
                            ) || ""
                        )
                            .trim()
                            .toLowerCase();


                    const users =
                        readUsers();


                    const result =
                        users
                            .filter(
                                user =>
                                    user.login !==
                                    current
                            )
                            .filter(
                                user => {

                                    if (!q) {
                                        return true;
                                    }


                                    const name =
                                        user.profile?.name ||
                                        user.login;


                                    return (
                                        user.login
                                            .toLowerCase()
                                            .includes(q) ||

                                        name
                                            .toLowerCase()
                                            .includes(q)
                                    );
                                }
                            )
                            .map(
                                publicUser
                            );


                    sendJSON(
                        response,
                        200,
                        result
                    );


                    return;
                }


                /* =================================================
                   PROFILE GET
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/profile"
                ) {

                    const login =
                        url.searchParams.get(
                            "login"
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
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Пользователь не найден"
                            }
                        );

                        return;
                    }


                    normalizeUser(
                        user
                    );


                    saveUsers(
                        users
                    );


                    sendJSON(
                        response,
                        200,
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
                   PROFILE UPDATE
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/profile"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const login =
                        String(
                            body.login ||
                            ""
                        )
                            .trim();


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
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Пользователь не найден"
                            }
                        );

                        return;
                    }


                    normalizeUser(
                        user
                    );


                    user.profile.name =
                        String(
                            body.name ??
                            user.profile.name
                        )
                            .trim()
                            .slice(
                                0,
                                100
                            );


                    user.profile.about =
                        String(
                            body.about ??
                            user.profile.about
                        )
                            .slice(
                                0,
                                1000
                            );


                    user.profile.photo =
                        String(
                            body.photo ??
                            user.profile.photo
                        )
                            .slice(
                                0,
                                5_000_000
                            );


                    user.profile.messageStyle =
                        String(
                            body.messageStyle ??
                            user.profile.messageStyle
                        );


                    saveUsers(
                        users
                    );


                    sendJSON(
                        response,
                        200,
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
                   FRIENDS
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/friends"
                ) {

                    const login =
                        url.searchParams.get(
                            "login"
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
                            response,
                            404,
                            []
                        );

                        return;
                    }


                    normalizeUser(
                        user
                    );


                    const result =
                        user.friends
                            .map(
                                friendLogin =>
                                    users.find(
                                        item =>
                                            item.login ===
                                            friendLogin
                                    )
                            )
                            .filter(Boolean)
                            .map(
                                publicUser
                            );


                    sendJSON(
                        response,
                        200,
                        result
                    );


                    return;
                }


                if (
                    request.method === "POST" &&
                    pathname === "/friends"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const login =
                        String(
                            body.login ||
                            ""
                        ).trim();


                    const friend =
                        String(
                            body.friend ||
                            ""
                        ).trim();


                    const action =
                        body.action;


                    const users =
                        readUsers();


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                login
                        );


                    const friendUser =
                        users.find(
                            item =>
                                item.login ===
                                friend
                        );


                    if (
                        !user ||
                        !friendUser
                    ) {

                        sendJSON(
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Пользователь не найден"
                            }
                        );

                        return;
                    }


                    normalizeUser(
                        user
                    );


                    if (
                        action ===
                        "add"
                    ) {

                        if (
                            !user.friends.includes(
                                friend
                            )
                        ) {

                            user.friends.push(
                                friend
                            );
                        }

                    } else if (
                        action ===
                        "remove"
                    ) {

                        user.friends =
                            user.friends.filter(
                                item =>
                                    item !==
                                    friend
                            );
                    }


                    saveUsers(
                        users
                    );


                    sendJSON(
                        response,
                        200,
                        {
                            success:
                                true
                        }
                    );


                    return;
                }


                /* =================================================
                   CHATS
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/chats"
                ) {

                    const login =
                        url.searchParams.get(
                            "login"
                        );


                    const messages =
                        readMessages();


                    const users =
                        readUsers();


                    const map =
                        new Map();


                    messages.forEach(
                        message => {

                            if (
                                message.from !==
                                login &&
                                message.to !==
                                login
                            ) {

                                return;
                            }


                            const other =
                                message.from ===
                                    login
                                        ? message.to
                                        : message.from;


                            if (
                                !map.has(
                                    other
                                )
                            ) {

                                map.set(
                                    other,
                                    {
                                        login:
                                            other,

                                        messageCount:
                                            0,

                                        lastTime:
                                            message.time
                                    }
                                );
                            }


                            const item =
                                map.get(
                                    other
                                );


                            if (
                                message.from ===
                                other
                            ) {

                                item.messageCount++;
                            }


                            if (
                                new Date(
                                    message.time
                                ) >
                                new Date(
                                    item.lastTime ||
                                    0
                                )
                            ) {

                                item.lastTime =
                                    message.time;
                            }
                        }
                    );


                    const result =
                        Array.from(
                            map.values()
                        )
                            .map(
                                item => {

                                    const user =
                                        users.find(
                                            u =>
                                                u.login ===
                                                item.login
                                        );


                                    return {

                                        ...item,

                                        user:
                                            publicUser(
                                                user
                                            )

                                    };
                                }
                            )
                            .filter(
                                item =>
                                    item.user
                            )
                            .sort(
                                (
                                    a,
                                    b
                                ) =>
                                    new Date(
                                        b.lastTime ||
                                        0
                                    ) -
                                    new Date(
                                        a.lastTime ||
                                        0
                                    )
                            );


                    sendJSON(
                        response,
                        200,
                        result
                    );


                    return;
                }


                /* =================================================
                   MESSAGES
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/messages"
                ) {

                    const user1 =
                        url.searchParams.get(
                            "user1"
                        );


                    const user2 =
                        url.searchParams.get(
                            "user2"
                        );


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
                        response,
                        200,
                        result
                    );


                    return;
                }


                /* =================================================
                   SEND MESSAGE
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/send-message"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const from =
                        String(
                            body.from ||
                            ""
                        ).trim();


                    const to =
                        String(
                            body.to ||
                            ""
                        ).trim();


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


                    if (
                        !from ||
                        !to ||
                        !text
                    ) {

                        sendJSON(
                            response,
                            400,
                            {
                                success:
                                    false,

                                message:
                                    "Неверные данные"
                            }
                        );

                        return;
                    }


                    const users =
                        readUsers();


                    const fromUser =
                        users.find(
                            user =>
                                user.login ===
                                from
                        );


                    const toUser =
                        users.find(
                            user =>
                                user.login ===
                                to
                        );


                    if (
                        !fromUser ||
                        !toUser
                    ) {

                        sendJSON(
                            response,
                            404,
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
                        response,
                        200,
                        {
                            success:
                                true,

                            message
                        }
                    );


                    return;
                }


                /* =================================================
                   CHANNELS GET
                ================================================= */

                if (
                    request.method === "GET" &&
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


                    sendJSON(
                        response,
                        200,
                        result
                    );


                    return;
                }


                /* =================================================
                   CREATE CHANNEL
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/channels"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const owner =
                        String(
                            body.owner ||
                            ""
                        ).trim();


                    const name =
                        String(
                            body.name ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                100
                            );


                    const description =
                        String(
                            body.description ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                1000
                            );


                    const photo =
                        String(
                            body.photo ||
                            ""
                        )
                            .slice(
                                0,
                                5_000_000
                            );


                    if (!owner || !name) {

                        sendJSON(
                            response,
                            400,
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


                    const ownerUser =
                        users.find(
                            user =>
                                user.login ===
                                owner
                        );


                    if (!ownerUser) {

                        sendJSON(
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Владелец не найден"
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
                            crypto
                                .randomBytes(
                                    4
                                )
                                .toString(
                                    "hex"
                                ),

                        name,

                        description,

                        photo,

                        owner,

                        subscribers: [
                            owner
                        ],

                        settings: {

                            comments:
                                false,

                            notifications:
                                true
                        },

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
                        response,
                        200,
                        {
                            success:
                                true,

                            channel
                        }
                    );


                    return;
                }


                /* =================================================
                   CHANNEL UPDATE
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/channel-update"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const channelId =
                        String(
                            body.channelId ||
                            ""
                        ).trim();


                    const owner =
                        String(
                            body.owner ||
                            ""
                        ).trim();


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
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Канал не найден"
                            }
                        );

                        return;
                    }


                    if (
                        channel.owner !==
                        owner
                    ) {

                        sendJSON(
                            response,
                            403,
                            {
                                success:
                                    false,

                                message:
                                    "Изменять канал может только владелец"
                            }
                        );

                        return;
                    }


                    const name =
                        String(
                            body.name ??
                            channel.name
                        )
                            .trim()
                            .slice(
                                0,
                                100
                            );


                    const description =
                        String(
                            body.description ??
                            channel.description
                        )
                            .trim()
                            .slice(
                                0,
                                1000
                            );


                    const photo =
                        String(
                            body.photo ??
                            channel.photo
                        )
                            .slice(
                                0,
                                5_000_000
                            );


                    if (!name) {

                        sendJSON(
                            response,
                            400,
                            {
                                success:
                                    false,

                                message:
                                    "Название канала не может быть пустым"
                            }
                        );

                        return;
                    }


                    channel.name =
                        name;

                    channel.description =
                        description;

                    channel.photo =
                        photo;


                    if (!channel.settings) {

                        channel.settings =
                            {};
                    }


                    channel.settings.comments =
                        !!(
                            body.comments ??
                            channel.settings.comments
                        );


                    channel.settings.notifications =
                        body.notifications ===
                        undefined
                            ? (
                                channel.settings
                                    .notifications !==
                                false
                            )
                            : !!body.notifications;


                    saveChannels(
                        channels
                    );


                    sendJSON(
                        response,
                        200,
                        {
                            success:
                                true,

                            channel
                        }
                    );


                    return;
                }


                /* =================================================
                   CHANNEL SUBSCRIPTION
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/channel-subscription"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const channelId =
                        String(
                            body.channelId ||
                            ""
                        ).trim();


                    const login =
                        String(
                            body.login ||
                            ""
                        ).trim();


                    const action =
                        body.action;


                    const channels =
                        readChannels();


                    const users =
                        readUsers();


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                channelId
                        );


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                login
                        );


                    if (
                        !channel ||
                        !user
                    ) {

                        sendJSON(
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Канал или пользователь не найден"
                            }
                        );

                        return;
                    }


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

                        if (
                            channel.owner ===
                            login
                        ) {

                            sendJSON(
                                response,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Владелец не может отписаться от своего канала"
                                }
                            );

                            return;
                        }


                        channel.subscribers =
                            channel.subscribers
                                .filter(
                                    item =>
                                        item !==
                                        login
                                );
                    }


                    saveChannels(
                        channels
                    );


                    sendJSON(
                        response,
                        200,
                        {
                            success:
                                true,

                            channel
                        }
                    );


                    return;
                }


                /* =================================================
                   CHANNEL POSTS GET
                ================================================= */

                if (
                    request.method === "GET" &&
                    pathname === "/channel-posts"
                ) {

                    const channelId =
                        url.searchParams.get(
                            "channelId"
                        );


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

                                    const user =
                                        users.find(
                                            item =>
                                                item.login ===
                                                post.author
                                        );


                                    return {

                                        ...post,

                                        authorUser:
                                            publicUser(
                                                user
                                            )
                                    };
                                }
                            );


                    sendJSON(
                        response,
                        200,
                        result
                    );


                    return;
                }


                /* =================================================
                   CHANNEL POST
                ================================================= */

                if (
                    request.method === "POST" &&
                    pathname === "/channel-post"
                ) {

                    const body =
                        await getBody(
                            request
                        );


                    const channelId =
                        String(
                            body.channelId ||
                            ""
                        ).trim();


                    const author =
                        String(
                            body.author ||
                            ""
                        ).trim();


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
                        body.media ||
                        null;


                    const mediaType =
                        String(
                            body.mediaType ||
                            ""
                        );


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
                            response,
                            404,
                            {
                                success:
                                    false,

                                message:
                                    "Канал не найден"
                            }
                        );

                        return;
                    }


                    if (
                        channel.owner !==
                        author
                    ) {

                        sendJSON(
                            response,
                            403,
                            {
                                success:
                                    false,

                                message:
                                    "Публиковать может только владелец канала"
                            }
                        );

                        return;
                    }


                    if (
                        !text &&
                        !media
                    ) {

                        sendJSON(
                            response,
                            400,
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
                        Обновляем всех подписчиков
                        в реальном времени.
                    */

                    channel.subscribers
                        .forEach(
                            login => {

                                sendToUser(
                                    login,
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
                        response,
                        200,
                        {
                            success:
                                true,

                            post
                        }
                    );


                    return;
                }


                /* =================================================
                   404
                ================================================= */

                sendJSON(
                    response,
                    404,
                    {
                        success:
                            false,

                        message:
                            "Маршрут не найден"
                    }
                );

            } catch (error) {

                console.error(
                    error
                );


                if (
                    error.message ===
                    "REQUEST_TOO_LARGE"
                ) {

                    sendJSON(
                        response,
                        413,
                        {
                            success:
                                false,

                            message:
                                "Файл или запрос слишком большой"
                        }
                    );

                    return;
                }


                if (
                    error.message ===
                    "INVALID_JSON"
                ) {

                    sendJSON(
                        response,
                        400,
                        {
                            success:
                                false,

                            message:
                                "Некорректные данные"
                        }
                    );

                    return;
                }


                sendJSON(
                    response,
                    500,
                    {
                        success:
                            false,

                        message:
                            "Ошибка сервера"
                    }
                );
            }
        }
    );


/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
    new WebSocket.Server({
        server
    });


const onlineUsers =
    new Map();


function sendToUser(
    login,
    data
) {

    const ws =
        onlineUsers.get(
            login
        );


    if (
        ws &&
        ws.readyState ===
        WebSocket.OPEN
    ) {

        try {

            ws.send(
                JSON.stringify(
                    data
                )
            );

        } catch {}
    }
}


wss.on(
    "connection",
    ws => {

        let loggedInAs = "";


        ws.on(
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

                        loggedInAs =
                            String(
                                data.login ||
                                ""
                            ).trim();


                        if (
                            loggedInAs
                        ) {

                            onlineUsers.set(
                                loggedInAs,
                                ws
                            );


                            ws.send(
                                JSON.stringify({
                                    type:
                                        "auth-ok"
                                })
                            );
                        }


                        return;
                    }


                    if (
                        data.type ===
                        "call"
                    ) {

                        const to =
                            String(
                                data.to ||
                                ""
                            ).trim();


                        sendToUser(
                            to,
                            {
                                type:
                                    "incoming-call",

                                from:
                                    loggedInAs,

                                video:
                                    !!data.video,

                                offer:
                                    data.offer,

                                name:
                                    data.name ||
                                    loggedInAs,

                                photo:
                                    data.photo ||
                                    ""
                            }
                        );


                        return;
                    }


                    if (
                        data.type ===
                        "answer"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "answer",

                                answer:
                                    data.answer
                            }
                        );


                        return;
                    }


                    if (
                        data.type ===
                        "ice-candidate"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "ice-candidate",

                                candidate:
                                    data.candidate
                            }
                        );


                        return;
                    }


                    if (
                        data.type ===
                        "reject-call"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "call-rejected",

                                reason:
                                    "Звонок отклонён"
                            }
                        );


                        return;
                    }


                    if (
                        data.type ===
                        "hangup"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "hangup"
                            }
                        );


                        return;
                    }

                } catch (error) {

                    console.error(
                        "WebSocket error:",
                        error
                    );
                }
            }
        );


        ws.on(
            "close",
            () => {

                if (
                    loggedInAs &&
                    onlineUsers.get(
                        loggedInAs
                    ) === ws
                ) {

                    onlineUsers.delete(
                        loggedInAs
                    );
                }
            }
        );
    }
);


/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Vibe запущен на http://localhost:${PORT}`
        );
    }
);