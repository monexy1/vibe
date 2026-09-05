const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");
const CHANNELS_FILE = path.join(__dirname, "channels.json");
const CHANNEL_POSTS_FILE = path.join(__dirname, "channel-posts.json");
const GROUPS_FILE = path.join(__dirname, "groups.json");

const MAX_BODY_SIZE = 20 * 1024 * 1024;


/* =========================================================
   FILES
========================================================= */

function ensureFile(file, defaultValue = []) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(
            file,
            JSON.stringify(defaultValue, null, 2)
        );
    }
}

ensureFile(USERS_FILE, []);
ensureFile(MESSAGES_FILE, []);
ensureFile(CHANNELS_FILE, []);
ensureFile(CHANNEL_POSTS_FILE, []);
ensureFile(GROUPS_FILE, []);


function readJSON(file) {
    try {
        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch {
        return [];
    }
}


function saveJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2)
    );
}


/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeUser(user) {

    if (!Array.isArray(user.friends)) {
        user.friends = [];
    }

    if (!Array.isArray(user.friendRequestsIncoming)) {
        user.friendRequestsIncoming = [];
    }

    if (!Array.isArray(user.friendRequestsOutgoing)) {
        user.friendRequestsOutgoing = [];
    }

    if (!Array.isArray(user.contacts)) {
        user.contacts = [];
    }

    if (!Array.isArray(user.blockedUsers)) {
        user.blockedUsers = [];
    }

    if (
        !user.profile ||
        typeof user.profile !== "object"
    ) {
        user.profile = {};
    }

    if (typeof user.profile.name !== "string") {
        user.profile.name = user.login || "";
    }

    if (typeof user.profile.about !== "string") {
        user.profile.about = "";
    }

    if (typeof user.profile.photo !== "string") {
        user.profile.photo = "";
    }

    if (typeof user.profile.background !== "string") {
        user.profile.background = "";
    }

    if (typeof user.profile.messageStyle !== "string") {
        user.profile.messageStyle = "classic";
    }

    if (
        user.profile.messageStyle !== "classic" &&
        user.profile.messageStyle !== "square" &&
        user.profile.messageStyle !== "neon"
    ) {
        user.profile.messageStyle = "classic";
    }

    if (
        user.profile.language !== "ru" &&
        user.profile.language !== "en"
    ) {
        user.profile.language = "ru";
    }

    if (typeof user.profile.birthDate !== "string") {
        user.profile.birthDate = "";
    }

    if (typeof user.profile.email !== "string") {
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
        user.profile.privacy.profile = "everyone";
    }

    if (
        !allowedPrivacy.includes(
            user.profile.privacy.birthDate
        )
    ) {
        user.profile.privacy.birthDate = "friends";
    }

    if (
        !allowedPrivacy.includes(
            user.profile.privacy.age
        )
    ) {
        user.profile.privacy.age = "friends";
    }

    if (
        !allowedPrivacy.includes(
            user.profile.privacy.photo
        )
    ) {
        user.profile.privacy.photo = "everyone";
    }

    if (
        !allowedPrivacy.includes(
            user.profile.privacy.about
        )
    ) {
        user.profile.privacy.about = "everyone";
    }

    /* Новые настройки */

    const friendRequestPrivacy = [
        "everyone",
        "friends",
        "nobody"
    ];

    if (!friendRequestPrivacy.includes(user.profile.privacy.allowFriendRequests)) {
        user.profile.privacy.allowFriendRequests = "everyone";
    }

    if (
        typeof user.profile.privacy.showOnline !==
        "boolean"
    ) {
        user.profile.privacy.showOnline = true;
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

    if (typeof channel.name !== "string") {
        channel.name = "Канал";
    }

    if (typeof channel.description !== "string") {
        channel.description = "";
    }

    if (typeof channel.photo !== "string") {
        channel.photo = "";
    }

    // Never keep a truncated/invalid data URL as a channel avatar.
    if (channel.photo && channel.photo.startsWith("data:image/")) {
        const comma = channel.photo.indexOf(",");
        if (
            comma < 0 ||
            channel.photo.length < comma + 20
        ) {
            channel.photo = "";
        }
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

    if (typeof channel.settings.public !== "boolean") {
        channel.settings.public = true;
    }

    if (channel.discussionGroupId) {
        channel.settings.comments = true;
    }

    return channel;
}


/* =========================================================
   GROUPS
========================================================= */

function normalizeGroup(group) {
    if (!Array.isArray(group.members)) group.members = [];
    if (!Array.isArray(group.admins)) group.admins = [];
    if (typeof group.id !== "string") group.id = Date.now().toString();
    if (typeof group.name !== "string") group.name = "Группа";
    if (typeof group.description !== "string") group.description = "";
    if (typeof group.photo !== "string") group.photo = "";
    return group;
}

function getGroups() {
    const groups = readJSON(GROUPS_FILE);
    let changed = false;
    groups.forEach(group => {
        const before = JSON.stringify(group);
        normalizeGroup(group);
        if (before !== JSON.stringify(group)) changed = true;
    });
    if (changed) saveJSON(GROUPS_FILE, groups);
    return groups;
}

/* =========================================================
   USERS
========================================================= */

function getUsers() {

    const users = readJSON(USERS_FILE);

    let changed = false;

    users.forEach(user => {

        const before =
            JSON.stringify(user);

        normalizeUser(user);

        if (
            before !==
            JSON.stringify(user)
        ) {
            changed = true;
        }
    });

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

function calculateAge(birthDate) {

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

    const now = new Date();

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

    if (!login1 || !login2) {
        return false;
    }

    if (login1 === login2) {
        return true;
    }

    const user =
        findUser(login1);

    if (!user) {
        return false;
    }

    return Array.isArray(user.friends) &&
        user.friends.includes(login2);
}


/* =========================================================
   ONLINE
========================================================= */

const onlineUsers = new Map();


function isUserOnline(login) {

    const ws =
        onlineUsers.get(login);

    return !!(
        ws &&
        ws.readyState === WebSocket.OPEN
    );
}


function getVisibleOnline(
    ownerLogin,
    viewerLogin
) {

    const owner =
        findUser(ownerLogin);

    if (!owner) {
        return false;
    }

    normalizeUser(owner);

    if (ownerLogin === viewerLogin) {
        return isUserOnline(ownerLogin);
    }

    if (
        owner.profile.privacy.showOnline !== true
    ) {
        return false;
    }

    return isUserOnline(ownerLogin);
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

        background:
            "",

        messageStyle:
            user.profile.messageStyle ||
            "classic",

        online:
            getVisibleOnline(
                user.login,
                viewerLogin
            ),

        isFriend:
            areFriends(
                user.login,
                viewerLogin
            ),

        hasIncomingFriendRequest:
            user.friendRequestsIncoming.includes(
                viewerLogin
            ),

        hasOutgoingFriendRequest:
            user.friendRequestsOutgoing.includes(
                viewerLogin
            ),

        isContact:
            (() => {
                const viewer = findUser(viewerLogin);
                if (!viewer) return false;
                normalizeUser(viewer);
                return viewer.contacts.includes(user.login);
            })(),

        isMutualContact:
            (() => {
                const viewer = findUser(viewerLogin);
                if (!viewer) return false;
                normalizeUser(viewer);
                return viewer.contacts.includes(user.login) &&
                       Array.isArray(user.contacts) &&
                       user.contacts.includes(viewerLogin);
            })(),

        isBlockedByViewer:
            (() => {
                const viewer = findUser(viewerLogin);
                if (!viewer) return false;
                normalizeUser(viewer);
                return viewer.blockedUsers.includes(user.login);
            })(),

        hasBlockedViewer:
            Array.isArray(user.blockedUsers) &&
            user.blockedUsers.includes(viewerLogin)
    };


    const profileAllowed =
        canSeeField(
            user.login,
            viewerLogin,
            privacy.profile
        );


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


    if (
        profileAllowed
    ) {

        result.background =
            user.profile.background || "";
    }


    if (
        !profileAllowed &&
        user.login !== viewerLogin
    ) {

        result.name =
            user.login;

        result.about = "";
        result.photo = "";
        result.background = "";
    }


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
                            JSON.parse(body)
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
                        login.length > 40
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


                    if (
                        password.length < 4
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Пароль должен содержать минимум 4 символа"
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

                        friendRequestsIncoming: [],

                        friendRequestsOutgoing: [],

                        profile: {

                            name:
                                name.slice(
                                    0,
                                    60
                                ) ||
                                login,

                            about: "",

                            photo: "",

                            background: "",

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
                                    "everyone",

                                allowFriendRequests:
                                    "everyone",

                                showOnline:
                                    true
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
                   CHANGE PASSWORD
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/change-password"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        ).trim();


                    const currentPassword =
                        String(
                            body.currentPassword || ""
                        );


                    const newPassword =
                        String(
                            body.newPassword || ""
                        );


                    if (
                        !login ||
                        !currentPassword ||
                        !newPassword
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Заполните все поля"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        newPassword.length < 4
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Новый пароль должен содержать минимум 4 символа"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        newPassword.length > 200
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Новый пароль слишком длинный"
                            },
                            400
                        );

                        return;
                    }


                    const users =
                        getUsers();


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


                    if (
                        user.password !==
                        currentPassword
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Текущий пароль указан неправильно"
                            },
                            401
                        );

                        return;
                    }


                    if (
                        currentPassword ===
                        newPassword
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Новый пароль должен отличаться от текущего"
                            },
                            400
                        );

                        return;
                    }


                    user.password =
                        newPassword;


                    saveJSON(
                        USERS_FILE,
                        users
                    );


                    sendJSON(
                        res,
                        {
                            success: true,
                            message:
                                "Пароль успешно изменён"
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
                        typeof body.background ===
                        "string"
                    ) {

                        user.profile.background =
                            body.background
                                .trim()
                                .slice(0, 2000000);
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


                        if (
                            ["everyone", "friends", "nobody"].includes(
                                body.privacy.allowFriendRequests
                            )
                        ) {
                            user.profile.privacy.allowFriendRequests =
                                body.privacy.allowFriendRequests;
                        }

                        // Backward compatibility with old boolean data.
                        if (typeof body.privacy.allowFriendRequests === "boolean") {
                            user.profile.privacy.allowFriendRequests =
                                body.privacy.allowFriendRequests ? "everyone" : "nobody";
                        }


                        if (
                            typeof body.privacy
                                .showOnline ===
                            "boolean"
                        ) {

                            user.profile
                                .privacy
                                .showOnline =
                                body.privacy
                                    .showOnline;
                        }
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
                   CONTACTS / BLOCKS
                ===================================================== */

                if (
                    req.method === "POST" &&
                    (pathname === "/contacts" || pathname === "/blocks")
                ) {
                    const body = await getBody(req);
                    const login = String(body.login || "").trim();
                    const target = String(body.target || "").trim();
                    const action = String(body.action || "add").trim();

                    const users = getUsers();
                    const user = users.find(item => item.login === login);
                    const targetUser = users.find(item => item.login === target);

                    if (!user || !targetUser) {
                        sendJSON(res, {success:false, message:"Пользователь не найден"}, 404);
                        return;
                    }

                    if (login === target) {
                        sendJSON(res, {success:false, message:"Нельзя изменить это для самого себя"}, 400);
                        return;
                    }

                    normalizeUser(user);
                    normalizeUser(targetUser);

                    const listName = pathname === "/blocks"
                        ? "blockedUsers"
                        : "contacts";

                    if (action === "add") {
                        if (!user[listName].includes(target)) {
                            user[listName].push(target);
                        }

                        if (pathname === "/blocks") {
                            user.contacts = user.contacts.filter(item => item !== target);
                            user.friendRequestsIncoming = user.friendRequestsIncoming.filter(item => item !== target);
                            user.friendRequestsOutgoing = user.friendRequestsOutgoing.filter(item => item !== target);
                            targetUser.friendRequestsIncoming = targetUser.friendRequestsIncoming.filter(item => item !== login);
                            targetUser.friendRequestsOutgoing = targetUser.friendRequestsOutgoing.filter(item => item !== login);
                        }
                    } else if (action === "remove") {
                        user[listName] = user[listName].filter(item => item !== target);
                    } else {
                        sendJSON(res, {success:false, message:"Неизвестное действие"}, 400);
                        return;
                    }

                    saveJSON(USERS_FILE, users);
                    broadcastFriendState([login, target], {
                        type:"contact-block-state-changed",
                        login,
                        target
                    });

                    sendJSON(res, {
                        success:true,
                        user:publicUser(user, login)
                    });
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
                   FRIEND REQUESTS GET
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/friend-requests"
                ) {

                    const login =
                        String(
                            url.searchParams.get(
                                "login"
                            ) || ""
                        ).trim();


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


                    normalizeUser(user);


                    const incoming =
                        user.friendRequestsIncoming
                            .map(
                                requestLogin =>
                                    findUser(
                                        requestLogin
                                    )
                            )
                            .filter(Boolean)
                            .map(
                                requestUser =>
                                    publicUser(
                                        requestUser,
                                        login
                                    )
                            );


                    const outgoing =
                        user.friendRequestsOutgoing
                            .map(
                                requestLogin =>
                                    findUser(
                                        requestLogin
                                    )
                            )
                            .filter(Boolean)
                            .map(
                                requestUser =>
                                    publicUser(
                                        requestUser,
                                        login
                                    )
                            );


                    sendJSON(
                        res,
                        {
                            success: true,
                            incoming,
                            outgoing
                        }
                    );

                    return;
                }


                /* =====================================================
                   FRIEND REQUESTS UPDATE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/friend-requests"
                ) {

                    const body =
                        await getBody(req);


                    const login =
                        String(
                            body.login || ""
                        ).trim();


                    const target =
                        String(
                            body.target || ""
                        ).trim();


                    const action =
                        String(
                            body.action || ""
                        );


                    const users =
                        getUsers();


                    const user =
                        users.find(
                            item =>
                                item.login ===
                                login
                        );


                    const targetUser =
                        users.find(
                            item =>
                                item.login ===
                                target
                        );


                    if (
                        !user ||
                        !targetUser
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


                    normalizeUser(user);
                    normalizeUser(targetUser);


                    if (
                        login === target
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Нельзя отправить заявку самому себе"
                            },
                            400
                        );

                        return;
                    }


                    /* =================================================
                       SEND
                    ================================================= */

                    if (
                        action === "send"
                    ) {

                        if (
                            areFriends(
                                login,
                                target
                            )
                        ) {

                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "Вы уже друзья"
                                },
                                400
                            );

                            return;
                        }


                        const requestPrivacy =
                            targetUser.profile.privacy.allowFriendRequests || "everyone";

                        if (
                            requestPrivacy === "nobody" ||
                            (requestPrivacy === "friends" && !areFriends(login, target))
                        ) {
                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "Этот пользователь ограничил заявки в друзья"
                                },
                                403
                            );
                            return;
                        }


                        if (
                            targetUser.friendRequestsIncoming
                                .includes(login)
                        ) {

                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "Заявка уже отправлена"
                                },
                                400
                            );

                            return;
                        }


                        if (
                            user.friendRequestsIncoming
                                .includes(target)
                        ) {

                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "У вас уже есть входящая заявка от этого пользователя"
                                },
                                400
                            );

                            return;
                        }


                        user.friendRequestsOutgoing
                            .push(target);


                        targetUser.friendRequestsIncoming
                            .push(login);


                        saveJSON(
                            USERS_FILE,
                            users
                        );


                        sendToUser(
                            target,
                            {
                                type:
                                    "friend-request",
                                from:
                                    publicUser(
                                        user,
                                        target
                                    )
                            }
                        );


                        broadcastFriendState([login, target], { type:"friend-state-changed" });

                        sendJSON(
                            res,
                            { success:true, message:"Заявка отправлена" }
                        );

                        return;
                    }


                    /* =================================================
                       ACCEPT
                    ================================================= */

                    if (
                        action === "accept"
                    ) {

                        if (
                            !user.friendRequestsIncoming
                                .includes(target)
                        ) {

                            sendJSON(
                                res,
                                {
                                    success: false,
                                    message:
                                        "Заявка не найдена"
                                },
                                404
                            );

                            return;
                        }


                        user.friendRequestsIncoming =
                            user.friendRequestsIncoming
                                .filter(
                                    item =>
                                        item !==
                                        target
                                );


                        targetUser.friendRequestsOutgoing =
                            targetUser
                                .friendRequestsOutgoing
                                .filter(
                                    item =>
                                        item !==
                                        login
                                );


                        if (
                            !user.friends.includes(
                                target
                            )
                        ) {

                            user.friends.push(
                                target
                            );
                        }


                        if (
                            !targetUser.friends.includes(
                                login
                            )
                        ) {

                            targetUser.friends.push(
                                login
                            );
                        }


                        saveJSON(
                            USERS_FILE,
                            users
                        );


                        sendToUser(
                            target,
                            {
                                type:
                                    "friend-accepted",
                                login
                            }
                        );


                        broadcastFriendState([login, target], { type:"friend-state-changed" });
                        sendJSON(res, { success:true, message:"Заявка принята" });

                        return;
                    }


                    /* =================================================
                       DECLINE
                    ================================================= */

                    if (
                        action === "decline"
                    ) {

                        user.friendRequestsIncoming =
                            user.friendRequestsIncoming
                                .filter(
                                    item =>
                                        item !==
                                        target
                                );


                        targetUser.friendRequestsOutgoing =
                            targetUser
                                .friendRequestsOutgoing
                                .filter(
                                    item =>
                                        item !==
                                        login
                                );


                        saveJSON(
                            USERS_FILE,
                            users
                        );


                        sendToUser(
                            target,
                            {
                                type:
                                    "friend-declined",
                                login
                            }
                        );


                        broadcastFriendState([login, target], { type:"friend-state-changed" });
                        sendJSON(res, { success:true, message:"Заявка отклонена" });

                        return;
                    }


                    /* =================================================
                       CANCEL
                    ================================================= */

                    if (
                        action === "cancel"
                    ) {

                        user.friendRequestsOutgoing =
                            user
                                .friendRequestsOutgoing
                                .filter(
                                    item =>
                                        item !==
                                        target
                                );


                        targetUser.friendRequestsIncoming =
                            targetUser
                                .friendRequestsIncoming
                                .filter(
                                    item =>
                                        item !==
                                        login
                                );


                        saveJSON(
                            USERS_FILE,
                            users
                        );


                        sendToUser(
                            target,
                            {
                                type:
                                    "friend-request-cancelled",
                                login
                            }
                        );


                        broadcastFriendState([login, target], { type:"friend-state-changed" });
                        sendJSON(res, { success:true, message:"Заявка отменена" });

                        return;
                    }


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
                                item.login ===
                                login
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

                        friend.friends =
                            friend.friends.filter(
                                item =>
                                    item !==
                                    login
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
                                            last.type ===
                                            "voice"
                                                ? "🎙 Голосовое сообщение"
                                                : (
                                                    last.text ||
                                                    ""
                                                ),

                                        lastTime:
                                            last.time ||
                                            "",

                                        lastMessageType:
                                            last.type ||
                                            "text",

                                        messageCount:
                                            messages.filter(m =>
                                                m.from === other &&
                                                m.to === login &&
                                                !m.deletedForAll &&
                                                !(Array.isArray(m.deletedFor) && m.deletedFor.includes(login))
                                            ).length
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


                    const type =
                        body.type === "voice"
                            ? "voice"
                            : body.type === "attachment"
                                ? "attachment"
                                : "text";


                    const text =
                        String(
                            body.text || ""
                        ).trim();


                    const audio =
                        type === "voice" &&
                        typeof body.audio ===
                        "string"
                            ? body.audio
                            : "";


                    const replyTo =
                        body.replyTo &&
                        typeof body.replyTo === "object" &&
                        body.replyTo.id
                            ? {
                                id: String(body.replyTo.id),
                                from: String(body.replyTo.from || ""),
                                text: String(body.replyTo.text || "").slice(0, 500)
                              }
                            : null;

                    const duration =
                        type === "voice" &&
                        Number.isFinite(Number(body.duration))
                            ? Number(body.duration)
                            : 0;

                    const attachment =
                        type === "attachment" &&
                        typeof body.attachment === "string"
                            ? body.attachment
                            : "";

                    const attachmentType =
                        type === "attachment"
                            ? String(body.attachmentType || "").slice(0,120)
                            : "";

                    const attachmentName =
                        type === "attachment"
                            ? String(body.attachmentName || "Файл").slice(0,180)
                            : "";


                    if (
                        !from ||
                        !to
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Не указан отправитель или получатель"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        !findUser(from) ||
                        !findUser(to)
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
                        type === "text" &&
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


                    if (
                        type === "voice" &&
                        !audio
                    ) {

                        sendJSON(
                            res,
                            {
                                success: false,
                                message:
                                    "Голосовое сообщение пустое"
                            },
                            400
                        );

                        return;
                    }


                    if (
                        type === "attachment" &&
                        !attachment
                    ) {
                        sendJSON(res, {success:false, message:"Файл пустой"}, 400);
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

                        type,

                        text:
                            type === "text"
                                ? text
                                : "",

                        audio:
                            type === "voice"
                                ? audio
                                : "",

                        duration:
                            type === "voice"
                                ? duration
                                : 0,

                        attachment:
                            type === "attachment"
                                ? attachment
                                : "",

                        attachmentType:
                            type === "attachment"
                                ? attachmentType
                                : "",

                        attachmentName:
                            type === "attachment"
                                ? attachmentName
                                : "",

                        replyTo,

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
                   DELETE MESSAGE
                ===================================================== */

                if (
                    req.method === "POST" &&
                    pathname === "/delete-message"
                ) {
                    const body = await getBody(req);
                    const login = String(body.login || "").trim();
                    const messageId = String(body.messageId || "").trim();
                    const mode = body.mode === "all" ? "all" : "self";
                    const messages = readJSON(MESSAGES_FILE);
                    const message = messages.find(m => String(m.id) === messageId);

                    if (!login || !message) {
                        sendJSON(res, { success:false, message:"Сообщение не найдено" }, 404);
                        return;
                    }

                    if (message.from !== login && message.to !== login) {
                        sendJSON(res, { success:false, message:"Нет доступа" }, 403);
                        return;
                    }

                    if (mode === "all") {
                        if (message.from !== login) {
                            sendJSON(res, { success:false, message:"Удалить у всех может только отправитель" }, 403);
                            return;
                        }
                        message.deletedForAll = true;
                    } else {
                        if (!Array.isArray(message.deletedFor)) message.deletedFor = [];
                        if (!message.deletedFor.includes(login)) message.deletedFor.push(login);
                    }

                    saveJSON(MESSAGES_FILE, messages);
                    sendToUser(message.from, {
                        type:"message-deleted", messageId, mode, by:login
                    });
                    sendToUser(message.to, {
                        type:"message-deleted", messageId, mode, by:login
                    });
                    sendJSON(res, { success:true, message });
                    return;
                }


                /* =====================================================
                   GROUPS
                ===================================================== */

                if (req.method === "GET" && pathname === "/groups") {
                    const login = String(url.searchParams.get("login") || "");
                    const result = getGroups()
                        .map(normalizeGroup)
                        .filter(group => group.members.includes(login))
                        .map(group => ({
                            ...group,
                            memberCount: group.members.length
                        }));
                    sendJSON(res, result);
                    return;
                }

                if (req.method === "POST" && pathname === "/groups") {
                    const body = await getBody(req);
                    const owner = String(body.owner || "").trim();
                    const name = String(body.name || "").trim();
                    const description = String(body.description || "").trim();
                    const photo = String(body.photo || "").trim();

                    if (!owner || !findUser(owner)) {
                        sendJSON(res, {success:false, message:"Пользователь не найден"}, 404);
                        return;
                    }
                    if (!name) {
                        sendJSON(res, {success:false, message:"Введите название группы"}, 400);
                        return;
                    }

                    const groups = getGroups();
                    const group = normalizeGroup({
                        id: "g_" + Date.now() + "_" + Math.random().toString(36).slice(2,8),
                        name, description, photo,
                        owner,
                        members:[owner],
                        admins:[owner],
                        createdAt:new Date().toISOString()
                    });
                    groups.push(group);
                    saveJSON(GROUPS_FILE, groups);
                    sendJSON(res, {success:true, group});
                    return;
                }

                if (req.method === "POST" && pathname === "/group-members") {
                    const body = await getBody(req);
                    const login = String(body.login || "").trim();
                    const target = String(body.target || "").trim();
                    const groupId = String(body.groupId || "").trim();
                    const action = body.action === "remove" ? "remove" : "add";
                    const groups = getGroups();
                    const group = groups.find(g => g.id === groupId);

                    if (!group || !findUser(login) || !findUser(target)) {
                        sendJSON(res, {success:false, message:"Группа или пользователь не найден"}, 404);
                        return;
                    }
                    normalizeGroup(group);

                    if (!group.admins.includes(login)) {
                        sendJSON(res, {success:false, message:"Только администратор может менять участников"}, 403);
                        return;
                    }

                    if (action === "add") {
                        if (!group.members.includes(target)) group.members.push(target);
                    } else {
                        group.members = group.members.filter(x => x !== target);
                        group.admins = group.admins.filter(x => x !== target);
                    }

                    saveJSON(GROUPS_FILE, groups);
                    sendJSON(res, {success:true, group});
                    return;
                }

                if (req.method === "GET" && pathname === "/group-messages") {
                    const groupId = String(url.searchParams.get("groupId") || "");
                    const login = String(url.searchParams.get("login") || "");
                    const group = getGroups().find(g => g.id === groupId);
                    if (!group || !group.members.includes(login)) {
                        sendJSON(res, [], 403);
                        return;
                    }
                    const messages = readJSON(MESSAGES_FILE)
                        .filter(m => m.groupId === groupId && !(
                            Array.isArray(m.deletedFor) && m.deletedFor.includes(login)
                        ) && !m.deletedForAll);
                    sendJSON(res, messages);
                    return;
                }

                if (req.method === "POST" && pathname === "/group-message") {
                    const body = await getBody(req);
                    const from = String(body.from || "").trim();
                    const groupId = String(body.groupId || "").trim();
                    const type =
                        body.type === "voice"
                            ? "voice"
                            : body.type === "attachment"
                                ? "attachment"
                                : "text";
                    const text = String(body.text || "").trim();
                    const audio = type === "voice" && typeof body.audio === "string" ? body.audio : "";
                    const duration = Number.isFinite(Number(body.duration)) ? Number(body.duration) : 0;
                    const attachment = type === "attachment" && typeof body.attachment === "string" ? body.attachment : "";
                    const attachmentType = type === "attachment" ? String(body.attachmentType || "").slice(0,120) : "";
                    const attachmentName = type === "attachment" ? String(body.attachmentName || "Файл").slice(0,180) : "";
                    const replyTo = body.replyTo && body.replyTo.id ? {
                        id:String(body.replyTo.id),
                        from:String(body.replyTo.from || ""),
                        text:String(body.replyTo.text || "").slice(0,500)
                    } : null;

                    const group = getGroups().find(g => g.id === groupId);
                    if (!group || !group.members.includes(from)) {
                        sendJSON(res, {success:false, message:"Нет доступа к группе"}, 403);
                        return;
                    }
                    if ((type === "text" && !text) || (type === "voice" && !audio) || (type === "attachment" && !attachment)) {
                        sendJSON(res, {success:false, message:"Пустое сообщение"}, 400);
                        return;
                    }

                    const message = {
                        id:Date.now().toString() + Math.random().toString(36).slice(2),
                        from, to:"",
                        groupId, type,
                        text:type === "text" ? text : "",
                        audio:type === "voice" ? audio : "",
                        duration:type === "voice" ? duration : 0,
                        attachment:type === "attachment" ? attachment : "",
                        attachmentType:type === "attachment" ? attachmentType : "",
                        attachmentName:type === "attachment" ? attachmentName : "",
                        replyTo,
                        time:new Date().toISOString()
                    };
                    const messages = readJSON(MESSAGES_FILE);
                    messages.push(message);
                    saveJSON(MESSAGES_FILE, messages);

                    group.members.forEach(member => {
                        if (member !== from) {
                            sendToUser(member, {type:"new-group-message", message});
                        }
                    });
                    sendJSON(res, {success:true, message});
                    return;
                }

                /* =====================================================
                   SEARCH PUBLIC CHANNELS
                ===================================================== */

                if (
                    req.method === "GET" &&
                    pathname === "/channel-search"
                ) {
                    const login = String(url.searchParams.get("login") || "");
                    const query = String(url.searchParams.get("q") || "")
                        .trim().toLowerCase();

                    if (!query) {
                        sendJSON(res, []);
                        return;
                    }

                    const channels = readJSON(CHANNELS_FILE)
                        .map(normalizeChannel);

                    const result = channels
                        .filter(channel => {
                            if (channel.settings.public === false) return false;

                            const haystack = [
                                channel.name,
                                channel.description,
                                channel.id
                            ].join(" ").toLowerCase();

                            return haystack.includes(query);
                        })
                        .map(channel => ({
                            ...channel,
                            subscribed: Array.isArray(channel.subscribers)
                                ? channel.subscribers.includes(login)
                                : false,
                            subscriberCount: Array.isArray(channel.subscribers)
                                ? channel.subscribers.length
                                : 0
                        }));

                    sendJSON(res, result);
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
                            .trim()
                            .slice(0, 6_000_000);


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
                                true,

                            notifications:
                                true,

                            public:
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

                                        views:Number(post.views||0),

                                        comments:Array.isArray(post.comments) ? post.comments : [],

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
                   CHANNEL POST VIEW
                ===================================================== */
                if (req.method === "POST" && pathname === "/channel-post-view") {
                    const body = await getBody(req);
                    const channelId = String(body.channelId || "");
                    const postId = String(body.postId || "");
                    const viewer = String(body.viewer || "");
                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const post = posts.find(p => p.id === postId && p.channelId === channelId);
                    if (!post) { sendJSON(res,{success:false,message:"Публикация не найдена"},404); return; }
                    post.views = Number(post.views || 0);
                    if (!post.viewers) post.viewers = [];
                    if (viewer && !post.viewers.includes(viewer)) { post.viewers.push(viewer); post.views++; }
                    saveJSON(CHANNEL_POSTS_FILE, posts);
                    sendJSON(res,{success:true,views:post.views});
                    return;
                }

                /* =====================================================
                   CHANNEL COMMENT
                ===================================================== */
                if (req.method === "POST" && pathname === "/channel-comment") {
                    const body = await getBody(req);
                    const channelId = String(body.channelId || "");
                    const postId = String(body.postId || "");
                    const author = String(body.author || "");
                    const text = String(body.text || "").trim().slice(0,300);
                    const channels = readJSON(CHANNELS_FILE);
                    const channel = channels.find(c => c.id === channelId);
                    if (!channel) { sendJSON(res,{success:false,message:"Канал не найден"},404); return; }
                    if (channel.settings && channel.settings.comments === false) { sendJSON(res,{success:false,message:"Комментарии отключены"},403); return; }
                    if (!findUser(author) || !text) { sendJSON(res,{success:false,message:"Комментарий пустой"},400); return; }
                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const post = posts.find(p => p.id === postId && p.channelId === channelId);
                    if (!post) { sendJSON(res,{success:false,message:"Публикация не найдена"},404); return; }
                    if (!Array.isArray(post.comments)) post.comments=[];
                    const u=findUser(author);
                    const comment={id:Date.now().toString()+Math.random().toString(36).slice(2),author,name:u.name||author,text,time:new Date().toISOString()};
                    post.comments.push(comment);
                    saveJSON(CHANNEL_POSTS_FILE,posts);
                    sendJSON(res,{success:true,comment});
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


function broadcastFriendState(logins, data) {
    [...new Set(logins.filter(Boolean))].forEach(login => sendToUser(login, data));
}


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


function broadcastOnlineStatus(
    login,
    online
) {

    const users =
        getUsers();


    users.forEach(
        user => {

            if (
                user.login === login
            ) {
                return;
            }


            if (user.login === login) return;
            const owner = findUser(login);
            const visible = owner && owner.profile && owner.profile.privacy && owner.profile.privacy.showOnline !== false;
            sendToUser(user.login, { type:"online-status", login, online: visible ? online : false });
        }
    );
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


                            broadcastOnlineStatus(
                                currentLogin,
                                true
                            );
                        }


                        return;
                    }


                    /* =============================================
                       TYPING
                    ============================================= */

                    if (
                        data.type ===
                        "typing"
                    ) {

                        if (
                            !currentLogin
                        ) {
                            return;
                        }


                        const to =
                            String(
                                data.to || ""
                            );


                        if (!to) {
                            return;
                        }


                        sendToUser(
                            to,
                            {
                                type:
                                    "typing",

                                from:
                                    currentLogin,

                                typing:
                                    data.typing ===
                                    true
                            }
                        );


                        return;
                    }


                    /* =============================================
                       RECORDING VOICE
                    ============================================= */

                    if (
                        data.type ===
                        "recording-voice"
                    ) {

                        if (
                            !currentLogin
                        ) {
                            return;
                        }


                        const to =
                            String(
                                data.to || ""
                            );


                        if (!to) {
                            return;
                        }


                        sendToUser(
                            to,
                            {
                                type:
                                    "recording-voice",

                                from:
                                    currentLogin,

                                recording:
                                    data.recording ===
                                    true
                            }
                        );


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
                       REJECT CALL
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

                    broadcastOnlineStatus(
                        currentLogin,
                        false
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