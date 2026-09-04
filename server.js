const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");
const CHANNELS_FILE = path.join(__dirname, "channels.json");
const CHANNEL_POSTS_FILE = path.join(__dirname, "channel-posts.json");

const MAX_BODY_SIZE = 20 * 1024 * 1024;


/* =========================================================
   FILES
========================================================= */

function ensureFile(file, defaultValue = []) {

    if (!fs.existsSync(file)) {

        fs.writeFileSync(
            file,
            JSON.stringify(
                defaultValue,
                null,
                2
            )
        );
    }
}


ensureFile(USERS_FILE, []);
ensureFile(MESSAGES_FILE, []);
ensureFile(CHANNELS_FILE, []);
ensureFile(CHANNEL_POSTS_FILE);


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


function saveJSON(file, data) {

    fs.writeFileSync(
        file,
        JSON.stringify(
            data,
            null,
            2
        )
    );
}


/* =========================================================
   USER NORMALIZATION
========================================================= */

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
        typeof user.profile.name !== "string"
    ) {

        user.profile.name =
            user.login || "";
    }


    if (
        typeof user.profile.about !== "string"
    ) {

        user.profile.about = "";
    }


    if (
        typeof user.profile.photo !== "string"
    ) {

        user.profile.photo = "";
    }


    if (
        typeof user.profile.messageStyle !== "string"
    ) {

        user.profile.messageStyle =
            "classic";
    }


    if (
        user.profile.messageStyle !== "classic" &&
        user.profile.messageStyle !== "square" &&
        user.profile.messageStyle !== "neon"
    ) {

        user.profile.messageStyle =
            "classic";
    }


    if (
        user.profile.language !== "ru" &&
        user.profile.language !== "en"
    ) {

        user.profile.language =
            "ru";
    }


    if (
        typeof user.profile.birthDate !== "string"
    ) {

        user.profile.birthDate = "";
    }


    if (
        typeof user.profile.email !== "string"
    ) {

        user.profile.email = "";
    }


    if (
        !user.profile.privacy ||
        typeof user.profile.privacy !== "object"
    ) {

        user.profile.privacy = {};
    }


    const allowedPrivacy = [
        "everyone",
        "friends",
        "nobody"
    ];


    if (
        !allowedPrivacy.includes(
            user.profile.privacy.profile
        )
    ) {

        user.profile.privacy.profile =
            "everyone";
    }


    if (
        !allowedPrivacy.includes(
            user.profile.privacy.birthDate
        )
    ) {

        user.profile.privacy.birthDate =
            "friends";
    }


    if (
        !allowedPrivacy.includes(
            user.profile.privacy.age
        )
    ) {

        user.profile.privacy.age =
            "friends";
    }


    if (
        !allowedPrivacy.includes(
            user.profile.privacy.photo
        )
    ) {

        user.profile.privacy.photo =
            "everyone";
    }


    if (
        !allowedPrivacy.includes(
            user.profile.privacy.about
        )
    ) {

        user.profile.privacy.about =
            "everyone";
    }


    return user;
}


/* =========================================================
   CHANNEL NORMALIZATION
========================================================= */

function normalizeChannel(channel) {

    if (!Array.isArray(channel.subscribers)) {
        channel.subscribers = [];
    }


    if (
        typeof channel.name !== "string"
    ) {

        channel.name = "Канал";
    }


    if (
        typeof channel.description !== "string"
    ) {

        channel.description = "";
    }


    if (
        typeof channel.photo !== "string"
    ) {

        channel.photo = "";
    }


    if (
        !channel.settings ||
        typeof channel.settings !== "object"
    ) {

        channel.settings = {};
    }


    if (
        typeof channel.settings.comments !== "boolean"
    ) {

        channel.settings.comments = false;
    }


    if (
        typeof channel.settings.notifications !== "boolean"
    ) {

        channel.settings.notifications = true;
    }


    return channel;
}


/* =========================================================
   USERS
========================================================= */

function getUsers() {

    const users = readJSON(
        USERS_FILE
    );

    let changed = false;


    users.forEach(
        user => {

            const before =
                JSON.stringify(user);

            normalizeUser(user);

            if (
                before !==
                JSON.stringify(user)
            ) {

                changed = true;
            }
        }
    );


    if (changed) {

        saveJSON(
            USERS_FILE,
            users
        );
    }


    return users;
}


function findUser(login) {

    const users = getUsers();

    return users.find(
        user =>
            user.login === login
    );
}


/* =========================================================
   AGE
========================================================= */

function calculateAge(
    birthDate
) {

    if (!birthDate) {
        return null;
    }


    const birth =
        new Date(
            birthDate +
            "T00:00:00"
        );


    if (
        Number.isNaN(
            birth.getTime()
        )
    ) {

        return null;
    }


    const now =
        new Date();


    let age =
        now.getFullYear() -
        birth.getFullYear();


    const month =
        now.getMonth() -
        birth.getMonth();


    if (
        month < 0 ||
        (
            month === 0 &&
            now.getDate() <
            birth.getDate()
        )
    ) {

        age--;
    }


    return age >= 0
        ? age
        : null;
}


/* =========================================================
   FRIENDS
========================================================= */

function areFriends(
    login1,
    login2
) {

    if (
        !login1 ||
        !login2
    ) {

        return false;
    }


    if (
        login1 === login2
    ) {

        return true;
    }


    const user =
        findUser(login1);


    if (!user) {
        return false;
    }


    return Array.isArray(
        user.friends
    ) &&
    user.friends.includes(
        login2
    );
}


/* =========================================================
   PRIVACY
========================================================= */

function canSeeField(
    ownerLogin,
    viewerLogin,
    setting
) {

    if (
        ownerLogin === viewerLogin
    ) {

        return true;
    }


    if (
        setting === "everyone"
    ) {

        return true;
    }


    if (
        setting === "friends"
    ) {

        return areFriends(
            ownerLogin,
            viewerLogin
        );
    }


    return false;
}


/* =========================================================
   PUBLIC USER
========================================================= */

function publicUser(
    user,
    viewerLogin = ""
) {

    normalizeUser(user);


    const privacy =
        user.profile.privacy;


    const result = {

        login:
            user.login,

        name:
            user.profile.name ||
            user.login,

        about:
            "",

        photo:
            "",

        messageStyle:
            user.profile.messageStyle ||
            "classic"
    };


    /*
        Профиль
    */

    const profileAllowed =
        canSeeField(
            user.login,
            viewerLogin,
            privacy.profile
        );


    /*
        ABOUT
    */

    if (
        profileAllowed &&
        canSeeField(
            user.login,
            viewerLogin,
            privacy.about
        )
    ) {

        result.about =
            user.profile.about || "";
    }


    /*
        PHOTO
    */

    if (
        profileAllowed &&
        canSeeField(
            user.login,
            viewerLogin,
            privacy.photo
        )
    ) {

        result.photo =
            user.profile.photo || "";
    }


    /*
        Если сам профиль скрыт
    */

    if (
        !profileAllowed &&
        user.login !== viewerLogin
    ) {

        result.name =
            user.login;

        result.about = "";
        result.photo = "";
    }


    /*
        DATE OF BIRTH
    */

    if (
        canSeeField(
            user.login,
            viewerLogin,
            privacy.birthDate
        )
    ) {

        result.birthDate =
            user.profile.birthDate || "";
    }


    /*
        AGE
    */

    if (
        canSeeField(
            user.login,
            viewerLogin,
            privacy.age
        )
    ) {

        result.age =
            calculateAge(
                user.profile.birthDate
            );
    }


    /*
        Личные данные только владельцу
    */

    if (
        user.login === viewerLogin
    ) {

        result.email =
            user.profile.email || "";

        result.language =
            user.profile.language || "ru";

        result.privacy =
            privacy;
    }


    return result;
}


/* =========================================================
   REQUEST BODY
========================================================= */

function getBody(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body +=
                        chunk.toString();


                    if (
                        body.length >
                        MAX_BODY_SIZE
                    ) {

                        reject(
                            new Error(
                                "Слишком большой запрос"
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
                                "Неверный JSON"
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


/* =========================================================
   RESPONSE
========================================================= */

function sendJSON(
    res,
    data,
    status = 200
) {

    const json =
        JSON.stringify(data);


    res.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Access-Control-Allow-Origin":
                "*",

            "Access-Control-Allow-Headers":
                "Content-Type",

            "Access-Control-Allow-Methods":
                "GET,POST,OPTIONS"
        }
    );


    res.end(json);
}


/* =========================================================
   SERVER
========================================================= */

const server =
    http.createServer(
        async (req, res) => {

            try {

                if (
                    req.method === "OPTIONS"
                ) {

                    res.writeHead(
                        204,
                        {
                            "Access-Control-Allow-Origin":
                                "*",

                            "Access-Control-Allow-Headers":
                                "Content-Type",

                            "Access-Control-Allow-Methods":
                                "GET,POST,OPTIONS"
                        }
                    );

                    res.end();

                    return;
                }


                const url =
                    new URL(
                        req.url,
                        `http://${req.headers.host}`
                    );


                const pathname =
                    url.pathname;


                /* =====================================================
                   MAIN PAGE
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/"
                ) {

                    const html =
                        fs.readFileSync(
                            path.join(
                                __dirname,
                                "index.html"
                            ),
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

                    return;
                }


                /* =====================================================
                   REGISTER
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/register"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        ).trim();


                    const password =
                        String(
                            body.password || ""
                        );


                    const name =
                        String(
                            body.name || ""
                        ).trim();


                    const email =
                        String(
                            body.email || ""
                        ).trim();


                    const birthDate =
                        String(
                            body.birthDate || ""
                        ).trim();


                    const language =
                        body.language === "en"
                            ? "en"
                            : "ru";


                    if (
                        !login ||
                        !password
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Введите логин и пароль"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        login.length >
                        40
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Логин слишком длинный"
                            },
                            400
                        );

                        return;
                    }


                    const users =
                        getUsers();


                    const exists =
                        users.find(
                            user =>
                                user.login.toLowerCase() ===
                                login.toLowerCase()
                        );


                    if (exists) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Такой логин уже существует"
                            },
                            400
                        );

                        return;
                    }


                    const user = {

                        login,

                        password,

                        friends: [],

                        profile: {

                            name:
                                name.slice(
                                    0,
                                    60
                                ) ||
                                login,

                            about: "",

                            photo: "",

                            messageStyle:
                                "classic",

                            language,

                            birthDate,

                            email:
                                email.slice(
                                    0,
                                    150
                                ),

                            privacy: {

                                profile:
                                    "everyone",

                                birthDate:
                                    "friends",

                                age:
                                    "friends",

                                photo:
                                    "everyone",

                                about:
                                    "everyone"
                            }
                        }
                    };


                    users.push(user);


                    saveJSON(
                        USERS_FILE,
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success: true,

                            user:
                                publicUser(
                                    user,
                                    login
                                )
                        }
                    );


                    return;
                }


                /* =====================================================
                   LOGIN
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/login"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        ).trim();


                    const password =
                        String(
                            body.password || ""
                        );


                    const user =
                        findUser(login);


                    if (
                        !user ||
                        user.password !== password
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Неверный логин или пароль"
                            },
                            401
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        {
                            success: true,

                            user:
                                publicUser(
                                    user,
                                    login
                                )
                        }
                    );


                    return;
                }


                /* =====================================================
                   USERS SEARCH
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/users"
                ) {

                    const query =
                        String(
                            url.searchParams.get(
                                "q"
                            ) || ""
                        )
                            .trim()
                            .toLowerCase();


                    const viewer =
                        String(
                            url.searchParams.get(
                                "viewer"
                            ) || ""
                        );


                    const users =
                        getUsers();


                    const result =
                        users
                            .filter(
                                user =>
                                    user.login
                                        .toLowerCase()
                                        .includes(query)
                            )
                            .filter(
                                user =>
                                    user.login !== viewer
                            )
                            .slice(0, 20)
                            .map(
                                user =>
                                    publicUser(
                                        user,
                                        viewer
                                    )
                            );


                    sendJSON(
                        res,
                        result
                    );

                    return;
                }


                /* =====================================================
                   PROFILE GET
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/profile"
                ) {

                    const login =
                        String(
                            url.searchParams.get(
                                "login"
                            ) || ""
                        );


                    const viewer =
                        String(
                            url.searchParams.get(
                                "viewer"
                            ) || ""
                        );


                    const user =
                        findUser(login);


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


                    sendJSON(
                        res,
                        {
                            success: true,

                            user:
                                publicUser(
                                    user,
                                    viewer
                                )
                        }
                    );

                    return;
                }


                /* =====================================================
                   PROFILE UPDATE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/profile"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        ).trim();


                    const users =
                        getUsers();


                    const user =
                        users.find(
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


                    if (
                        typeof body.name ===
                        "string"
                    ) {

                        user.profile.name =
                            body.name
                                .trim()
                                .slice(0, 60) ||
                            user.login;
                    }


                    if (
                        typeof body.about ===
                        "string"
                    ) {

                        user.profile.about =
                            body.about
                                .trim()
                                .slice(0, 500);
                    }


                    if (
                        typeof body.photo ===
                        "string"
                    ) {

                        user.profile.photo =
                            body.photo.trim();
                    }


                    if (
                        typeof body.messageStyle ===
                        "string"
                    ) {

                        const allowedStyles = [
                            "classic",
                            "square",
                            "neon"
                        ];


                        if (
                            allowedStyles.includes(
                                body.messageStyle
                            )
                        ) {

                            user.profile.messageStyle =
                                body.messageStyle;
                        }
                    }


                    if (
                        body.language === "ru" ||
                        body.language === "en"
                    ) {

                        user.profile.language =
                            body.language;
                    }


                    if (
                        typeof body.email ===
                        "string"
                    ) {

                        user.profile.email =
                            body.email
                                .trim()
                                .slice(0, 150);
                    }


                    if (
                        typeof body.birthDate ===
                        "string"
                    ) {

                        user.profile.birthDate =
                            body.birthDate.trim();
                    }


                    if (
                        body.privacy &&
                        typeof body.privacy ===
                        "object"
                    ) {

                        const allowed = [
                            "everyone",
                            "friends",
                            "nobody"
                        ];


                        Object.keys(
                            body.privacy
                        ).forEach(
                            key => {

                                if (
                                    [
                                        "profile",
                                        "birthDate",
                                        "age",
                                        "photo",
                                        "about"
                                    ].includes(key) &&
                                    allowed.includes(
                                        body.privacy[key]
                                    )
                                ) {

                                    user.profile
                                        .privacy[key] =
                                        body.privacy[key];
                                }
                            }
                        );
                    }


                    saveJSON(
                        USERS_FILE,
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success: true,

                            user:
                                publicUser(
                                    user,
                                    login
                                )
                        }
                    );

                    return;
                }


                /* =====================================================
                   FRIENDS GET
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/friends"
                ) {

                    const login =
                        String(
                            url.searchParams.get(
                                "login"
                            ) || ""
                        );


                    const user =
                        findUser(login);


                    if (!user) {

                        sendJSON(
                            res,
                            []
                        );

                        return;
                    }


                    const result =
                        user.friends
                            .map(
                                friendLogin =>
                                    findUser(
                                        friendLogin
                                    )
                            )
                            .filter(Boolean)
                            .map(
                                friend =>
                                    publicUser(
                                        friend,
                                        login
                                    )
                            );


                    sendJSON(
                        res,
                        result
                    );

                    return;
                }


                /* =====================================================
                   FRIENDS UPDATE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/friends"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        );


                    const friendLogin =
                        String(
                            body.friend || ""
                        );


                    const action =
                        body.action;


                    const users =
                        getUsers();


                    const user =
                        users.find(
                            item =>
                                item.login === login
                        );


                    const friend =
                        users.find(
                            item =>
                                item.login ===
                                friendLogin
                        );


                    if (
                        !user ||
                        !friend
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


                    if (
                        action === "add"
                    ) {

                        if (
                            !user.friends.includes(
                                friendLogin
                            )
                        ) {

                            user.friends.push(
                                friendLogin
                            );
                        }

                    } else if (
                        action === "remove"
                    ) {

                        user.friends =
                            user.friends.filter(
                                item =>
                                    item !==
                                    friendLogin
                            );
                    }


                    saveJSON(
                        USERS_FILE,
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success: true
                        }
                    );

                    return;
                }


                /* =====================================================
                   CHATS
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/chats"
                ) {

                    const login =
                        String(
                            url.searchParams.get(
                                "login"
                            ) || ""
                        );


                    const messages =
                        readJSON(
                            MESSAGES_FILE
                        );


                    const users =
                        getUsers();


                    const map =
                        new Map();


                    messages.forEach(
                        message => {

                            if (
                                message.from !== login &&
                                message.to !== login
                            ) {

                                return;
                            }


                            const other =
                                message.from === login
                                    ? message.to
                                    : message.from;


                            const previous =
                                map.get(other);


                            if (
                                !previous ||
                                new Date(
                                    message.time
                                ) >
                                new Date(
                                    previous.lastTime
                                )
                            ) {

                                map.set(
                                    other,
                                    message
                                );
                            }
                        }
                    );


                    const result =
                        Array.from(
                            map.entries()
                        )
                            .map(
                                ([other, last]) => {

                                    const user =
                                        users.find(
                                            item =>
                                                item.login ===
                                                other
                                        );


                                    if (!user) {
                                        return null;
                                    }


                                    return {

                                        login:
                                            other,

                                        user:
                                            publicUser(
                                                user,
                                                login
                                            ),

                                        lastMessage:
                                            last.text ||
                                            "",

                                        lastTime:
                                            last.time ||
                                            ""
                                    };
                                }
                            )
                            .filter(Boolean);


                    result.sort(
                        (a, b) =>
                            new Date(
                                b.lastTime
                            ) -
                            new Date(
                                a.lastTime
                            )
                    );


                    sendJSON(
                        res,
                        result
                    );

                    return;
                }


                /* =====================================================
                   MESSAGES
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/messages"
                ) {

                    const user1 =
                        String(
                            url.searchParams.get(
                                "user1"
                            ) || ""
                        );


                    const user2 =
                        String(
                            url.searchParams.get(
                                "user2"
                            ) || ""
                        );


                    const messages =
                        readJSON(
                            MESSAGES_FILE
                        );


                    const result =
                        messages.filter(
                            message =>
                                (
                                    message.from === user1 &&
                                    message.to === user2
                                ) ||
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


                /* =====================================================
                   SEND MESSAGE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/send-message"
                ) {

                    const body =
                        await getBody(req);


                    const from =
                        String(
                            body.from || ""
                        );


                    const to =
                        String(
                            body.to || ""
                        );


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
                                    "Пустое сообщение"
                            },
                            400
                        );

                        return;
                    }


                    const message = {

                        id:
                            Date.now().toString() +
                            Math.random()
                                .toString(36)
                                .slice(2),

                        from,

                        to,

                        text,

                        time:
                            new Date()
                                .toISOString()
                    };


                    const messages =
                        readJSON(
                            MESSAGES_FILE
                        );


                    messages.push(message);


                    saveJSON(
                        MESSAGES_FILE,
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
                            success: true,

                            message
                        }
                    );

                    return;
                }


                /* =====================================================
                   CHANNELS GET
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/channels"
                ) {

                    const login =
                        String(
                            url.searchParams.get(
                                "login"
                            ) || ""
                        );


                    const channels =
                        readJSON(
                            CHANNELS_FILE
                        ).map(
                            normalizeChannel
                        );


                    saveJSON(
                        CHANNELS_FILE,
                        channels
                    );


                    const posts =
                        readJSON(
                            CHANNEL_POSTS_FILE
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


                                const last =
                                    channelPosts[
                                        channelPosts.length - 1
                                    ];


                                return {

                                    ...channel,

                                    subscribed:
                                        channel.subscribers
                                            .includes(login),

                                    postCount:
                                        channelPosts.length,

                                    lastTime:
                                        last
                                            ? last.time
                                            : ""
                                };
                            }
                        );


                    sendJSON(
                        res,
                        result
                    );

                    return;
                }


                /* =====================================================
                   CREATE CHANNEL
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/channels"
                ) {

                    const body =
                        await getBody(req);


                    const owner =
                        String(
                            body.owner || ""
                        );


                    const name =
                        String(
                            body.name || ""
                        )
                            .trim()
                            .slice(0, 80);


                    const description =
                        String(
                            body.description || ""
                        )
                            .trim()
                            .slice(0, 500);


                    const photo =
                        String(
                            body.photo || ""
                        )
                            .trim();


                    if (
                        !owner ||
                        !name
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Введите название канала"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        !findUser(owner)
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Владелец не найден"
                            },
                            404
                        );

                        return;
                    }


                    const channels =
                        readJSON(
                            CHANNELS_FILE
                        );


                    const channel = {

                        id:
                            Date.now().toString() +
                            Math.random()
                                .toString(36)
                                .slice(2),

                        name,

                        description,

                        photo,

                        owner,

                        subscribers:
                            [owner],

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


                    channels.push(channel);


                    saveJSON(
                        CHANNELS_FILE,
                        channels
                    );


                    sendJSON(
                        res,
                        {
                            success: true,
                            channel
                        }
                    );

                    return;
                }


                /* =====================================================
                   CHANNEL UPDATE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/channel-update"
                ) {

                    const body =
                        await getBody(req);


                    const channels =
                        readJSON(
                            CHANNELS_FILE
                        );


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                body.channelId
                        );


                    if (!channel) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Канал не найден"
                            },
                            404
                        );

                        return;
                    }


                    if (
                        channel.owner !==
                        body.owner
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Только владелец может изменять канал"
                            },
                            403
                        );

                        return;
                    }


                    normalizeChannel(channel);


                    if (
                        typeof body.name ===
                        "string"
                    ) {

                        channel.name =
                            body.name
                                .trim()
                                .slice(0, 80);
                    }


                    if (
                        typeof body.description ===
                        "string"
                    ) {

                        channel.description =
                            body.description
                                .trim()
                                .slice(0, 500);
                    }


                    if (
                        typeof body.photo ===
                        "string"
                    ) {

                        channel.photo =
                            body.photo.trim();
                    }


                    if (
                        typeof body.notifications ===
                        "boolean"
                    ) {

                        channel.settings.notifications =
                            body.notifications;
                    }


                    if (
                        typeof body.comments ===
                        "boolean"
                    ) {

                        channel.settings.comments =
                            body.comments;
                    }


                    saveJSON(
                        CHANNELS_FILE,
                        channels
                    );


                    sendJSON(
                        res,
                        {
                            success: true,
                            channel
                        }
                    );

                    return;
                }


                /* =====================================================
                   CHANNEL SUBSCRIPTION
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/channel-subscription"
                ) {

                    const body =
                        await getBody(req);


                    const channels =
                        readJSON(
                            CHANNELS_FILE
                        );


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                body.channelId
                        );


                    if (!channel) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Канал не найден"
                            },
                            404
                        );

                        return;
                    }


                    normalizeChannel(channel);


                    const login =
                        String(
                            body.login || ""
                        );


                    if (
                        !findUser(login)
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


                    if (
                        body.action ===
                        "subscribe"
                    ) {

                        if (
                            !channel.subscribers.includes(
                                login
                            )
                        ) {

                            channel.subscribers.push(
                                login
                            );
                        }

                    } else if (
                        body.action ===
                        "unsubscribe"
                    ) {

                        if (
                            channel.owner ===
                            login
                        ) {

                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "Владелец не может отписаться от своего канала"
                                },
                                400
                            );

                            return;
                        }


                        channel.subscribers =
                            channel.subscribers.filter(
                                item =>
                                    item !== login
                            );
                    }


                    saveJSON(
                        CHANNELS_FILE,
                        channels
                    );


                    sendJSON(
                        res,
                        {
                            success: true,
                            channel
                        }
                    );

                    return;
                }


                /* =====================================================
                   CHANNEL POSTS GET
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/channel-posts"
                ) {

                    const channelId =
                        String(
                            url.searchParams.get(
                                "channelId"
                            ) || ""
                        );


                    const viewer =
                        String(
                            url.searchParams.get(
                                "viewer"
                            ) || ""
                        );


                    const posts =
                        readJSON(
                            CHANNEL_POSTS_FILE
                        );


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
                                        findUser(
                                            post.author
                                        );


                                    return {

                                        ...post,

                                        authorUser:
                                            author
                                                ? publicUser(
                                                    author,
                                                    viewer
                                                )
                                                : {
                                                    login:
                                                        post.author,

                                                    name:
                                                        post.author,

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


                /* =====================================================
                   CHANNEL POST
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/channel-post"
                ) {

                    const body =
                        await getBody(req);


                    const channels =
                        readJSON(
                            CHANNELS_FILE
                        );


                    const channel =
                        channels.find(
                            item =>
                                item.id ===
                                body.channelId
                        );


                    if (!channel) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Канал не найден"
                            },
                            404
                        );

                        return;
                    }


                    if (
                        channel.owner !==
                        body.author
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Только владелец может публиковать"
                            },
                            403
                        );

                        return;
                    }


                    const text =
                        String(
                            body.text || ""
                        ).trim();


                    const media =
                        typeof body.media ===
                        "string"
                            ? body.media
                            : null;


                    const mediaType =
                        typeof body.mediaType ===
                        "string"
                            ? body.mediaType
                            : "";


                    if (
                        !text &&
                        !media
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Публикация пустая"
                            },
                            400
                        );

                        return;
                    }


                    const post = {

                        id:
                            Date.now().toString() +
                            Math.random()
                                .toString(36)
                                .slice(2),

                        channelId:
                            channel.id,

                        author:
                            body.author,

                        text,

                        media,

                        mediaType,

                        time:
                            new Date()
                                .toISOString()
                    };


                    const posts =
                        readJSON(
                            CHANNEL_POSTS_FILE
                        );


                    posts.push(post);


                    saveJSON(
                        CHANNEL_POSTS_FILE,
                        posts
                    );


                    /*
                        Отправляем подписчикам
                        название и фото канала.
                    */

                    channel.subscribers.forEach(
                        subscriber => {

                            sendToUser(
                                subscriber,
                                {
                                    type:
                                        "new-channel-post",

                                    channelId:
                                        channel.id,

                                    channelName:
                                        channel.name,

                                    channelPhoto:
                                        channel.photo,

                                    channelDescription:
                                        channel.description,

                                    post
                                }
                            );
                        }
                    );


                    sendJSON(
                        res,
                        {
                            success: true,
                            post
                        }
                    );

                    return;
                }


                /* =====================================================
                   404
                ===================================================== */

                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Страница не найдена"
                    },
                    404
                );

            } catch (error) {

                console.error(error);


                sendJSON(
                    res,
                    {
                        success: false,
                        message:
                            "Ошибка сервера"
                    },
                    500
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
        onlineUsers.get(login);


    if (
        ws &&
        ws.readyState ===
        WebSocket.OPEN
    ) {

        ws.send(
            JSON.stringify(data)
        );
    }
}


wss.on(
    "connection",
    ws => {

        let currentLogin = "";


        ws.on(
            "message",
            raw => {

                try {

                    const data =
                        JSON.parse(
                            raw.toString()
                        );


                    /* =============================================
                       AUTH
                    ============================================= */

                    if (
                        data.type ===
                        "auth"
                    ) {

                        currentLogin =
                            String(
                                data.login || ""
                            );


                        if (
                            currentLogin &&
                            findUser(currentLogin)
                        ) {

                            onlineUsers.set(
                                currentLogin,
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


                    /* =============================================
                       CALL
                    ============================================= */

                    if (
                        data.type ===
                        "call"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "incoming-call",

                                from:
                                    currentLogin,

                                video:
                                    !!data.video,

                                offer:
                                    data.offer,

                                name:
                                    data.name ||
                                    currentLogin,

                                photo:
                                    data.photo ||
                                    ""
                            }
                        );

                        return;
                    }


                    /* =============================================
                       ANSWER
                    ============================================= */

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


                    /* =============================================
                       ICE
                    ============================================= */

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


                    /* =============================================
                       REJECT
                    ============================================= */

                    if (
                        data.type ===
                        "reject-call"
                    ) {

                        sendToUser(
                            data.to,
                            {
                                type:
                                    "call-rejected"
                            }
                        );

                        return;
                    }


                    /* =============================================
                       HANGUP
                    ============================================= */

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

                } catch {

                    console.log(
                        "Некорректное WebSocket сообщение"
                    );
                }
            }
        );


        ws.on(
            "close",
            () => {

                if (
                    currentLogin &&
                    onlineUsers.get(
                        currentLogin
                    ) === ws
                ) {

                    onlineUsers.delete(
                        currentLogin
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
            `Vibe server запущен на порту ${PORT}`
        );
    }
);