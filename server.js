require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
);

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
   SUPABASE PERSISTENT MESSAGES
   Direct messages are stored in Supabase so Render redeploys
   cannot erase the chat history.
========================================================= */

function messageFromSupabaseRow(row) {
    if (!row) return null;
    let replyTo = row.reply_to ?? null;
    if (typeof replyTo === "string") {
        try { replyTo = JSON.parse(replyTo); } catch {}
    }
    let reactions = row.reactions ?? {};
    if (typeof reactions === "string") {
        try { reactions = JSON.parse(reactions); } catch { reactions = {}; }
    }
    let deletedFor = row.deleted_for ?? [];
    if (typeof deletedFor === "string") {
        try { deletedFor = JSON.parse(deletedFor); } catch { deletedFor = []; }
    }
    return {
        id: String(row.id),
        from: row.from_login || row.from || "",
        to: row.to_login || row.to || "",
        groupId: row.group_id || "",
        postId: row.post_id || "",
        type: row.type || "text",
        text: row.text || "",
        audio: row.audio || "",
        duration: Number(row.duration || 0),
        attachment: row.attachment || "",
        attachmentType: row.attachment_type || "",
        attachmentName: row.attachment_name || "",
        replyTo,
        reactions: reactions && typeof reactions === "object" ? reactions : {},
        deletedFor: Array.isArray(deletedFor) ? deletedFor : [],
        deletedForAll: !!row.deleted_for_all,
        time: row.created_at || row.time || new Date().toISOString()
    };
}

function messageToSupabaseRow(message) {
    return {
        id: String(message.id),
        from_login: String(message.from || ""),
        to_login: String(message.to || ""),
        group_id: message.groupId || null,
        post_id: message.postId || null,
        type: message.type || "text",
        text: message.text || "",
        audio: message.audio || "",
        duration: Number(message.duration || 0),
        attachment: message.attachment || "",
        attachment_type: message.attachmentType || "",
        attachment_name: message.attachmentName || "",
        reply_to: message.replyTo || null,
        reactions: message.reactions || {},
        deleted_for: Array.isArray(message.deletedFor) ? message.deletedFor : [],
        deleted_for_all: !!message.deletedForAll,
        created_at: message.time || new Date().toISOString()
    };
}

async function getPersistentMessages() {
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Supabase messages read error:", error.message);
        return readJSON(MESSAGES_FILE);
    }

    return Array.isArray(data)
        ? data.map(messageFromSupabaseRow).filter(Boolean)
        : [];
}

async function insertPersistentMessage(message) {
    const row = messageToSupabaseRow(message);
    const { error } = await supabase
        .from("messages")
        .upsert(row, { onConflict: "id" });

    if (error) {
        console.error("Supabase message insert error:", error.message);
        throw new Error("Не удалось сохранить сообщение");
    }
}

async function updatePersistentMessage(message) {
    const row = messageToSupabaseRow(message);
    const { error } = await supabase
        .from("messages")
        .update(row)
        .eq("id", String(message.id));

    if (error) {
        console.error("Supabase message update error:", error.message);
        throw new Error("Не удалось сохранить сообщение");
    }
}

async function migrateLocalMessagesToSupabase() {
    const local = readJSON(MESSAGES_FILE);
    if (!Array.isArray(local) || !local.length) return;

    const rows = local.map(messageToSupabaseRow);
    const { error } = await supabase
        .from("messages")
        .upsert(rows, { onConflict: "id" });

    if (error) {
        console.error("Supabase message migration error:", error.message);
        return;
    }

    console.log(`Migrated ${rows.length} local messages to Supabase.`);
}

migrateLocalMessagesToSupabase().catch(error => {
    console.error("Message migration failed:", error.message);
});


/* =========================================================
   SUPABASE USERS
========================================================= */

async function getSupabaseUser(login) {
    const normalizedLogin = String(login || "").trim();

    if (!normalizedLogin) {
        return null;
    }

    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("login", normalizedLogin)
        .maybeSingle();

    if (error) {
        console.error("Supabase get user error:", error.message);
        throw new Error("Ошибка подключения к Supabase");
    }

    return data || null;
}


async function getSupabaseUsersMap() {
    const { data, error } = await supabase
        .from("users")
        .select("*");

    if (error) {
        console.error("Supabase users list error:", error.message);
        return new Map();
    }

    const map = new Map();

    (Array.isArray(data) ? data : []).forEach(row => {
        if (row && row.login) {
            map.set(String(row.login), row);
        }
    });

    return map;
}

function supabaseRowToLocalUser(row) {
    if (!row) return null;

    const user = {
        login: row.login || "",
        password: row.password || "",
        friends: [],
        friendRequestsIncoming: [],
        friendRequestsOutgoing: [],
        contacts: [],
        blockedUsers: [],
        profile: {
            name: row.name || row.login || "",
            about: row.about || "",
            photo: row.photo || "",
            background: row.background || "",
            messageStyle: "classic",
            language: row.language === "en" ? "en" : "ru",
            birthDate: row.birth_date || "",
            email: row.email || "",
            privacy: {
                profile: "everyone",
                birthDate: "friends",
                age: "friends",
                photo: "everyone",
                about: "everyone",
                allowFriendRequests: "everyone",
                showOnline: true
            }
        }
    };

    normalizeUser(user);
    return user;
}


async function createSupabaseUser(user) {
    const profile = user.profile || {};

    const row = {
        login: user.login,
        password: user.password,
        name: profile.name || user.login,
        about: profile.about || "",
        photo: profile.photo || "",
        background: profile.background || "",
        language: profile.language === "en" ? "en" : "ru",
        birth_date: profile.birthDate || null,
        email: profile.email || ""
    };

    const { data, error } = await supabase
        .from("users")
        .insert(row)
        .select("*")
        .single();

    if (error) {
        console.error("Supabase create user error:", error.message);
        throw new Error(error.code === "23505"
            ? "Такой логин уже существует"
            : "Не удалось сохранить аккаунт в Supabase");
    }

    return data;
}

async function updateSupabaseUser(login, changes) {
    const { data, error } = await supabase
        .from("users")
        .update(changes)
        .eq("login", login)
        .select("*")
        .maybeSingle();

    if (error) {
        console.error("Supabase update user error:", error.message);
        throw new Error("Не удалось сохранить изменения в Supabase");
    }

    return data || null;
}

function applySupabaseUserToLocalUser(localUser, row) {
    if (!localUser || !row) {
        return localUser;
    }

    normalizeUser(localUser);

    localUser.login = row.login || localUser.login;
    localUser.password = row.password || localUser.password;

    if (typeof row.name === "string") localUser.profile.name = row.name;
    if (typeof row.about === "string") localUser.profile.about = row.about;
    if (typeof row.photo === "string") localUser.profile.photo = row.photo;
    if (typeof row.background === "string") localUser.profile.background = row.background;
    if (row.language === "ru" || row.language === "en") localUser.profile.language = row.language;
    if (typeof row.birth_date === "string") localUser.profile.birthDate = row.birth_date;
    if (row.birth_date === null) localUser.profile.birthDate = "";
    if (typeof row.email === "string") localUser.profile.email = row.email;

    return localUser;
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

    if (typeof channel.discussionGroupId !== "string") {
        channel.discussionGroupId = "";
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
    if (!group.settings || typeof group.settings !== "object") group.settings = {};
    if (typeof group.settings.public !== "boolean") group.settings.public = true;
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
                        String(body.login || "").trim();

                    const password =
                        String(body.password || "");

                    const name =
                        String(body.name || "").trim();

                    const email =
                        String(body.email || "").trim();

                    const birthDate =
                        String(body.birthDate || "").trim();

                    const language =
                        body.language === "en"
                            ? "en"
                            : "ru";

                    if (!login || !password) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Введите логин и пароль"
                            },
                            400
                        );
                        return;
                    }

                    if (login.length > 40) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Логин слишком длинный"
                            },
                            400
                        );
                        return;
                    }

                    if (password.length < 4) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Пароль должен содержать минимум 4 символа"
                            },
                            400
                        );
                        return;
                    }

                    let exists;
                    try {
                        exists = await getSupabaseUser(login);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    if (exists) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Такой логин уже существует"
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
                        contacts: [],
                        blockedUsers: [],
                        profile: {
                            name: name.slice(0, 60) || login,
                            about: "",
                            photo: "",
                            background: "",
                            messageStyle: "classic",
                            language,
                            birthDate,
                            email: email.slice(0, 150),
                            privacy: {
                                profile: "everyone",
                                birthDate: "friends",
                                age: "friends",
                                photo: "everyone",
                                about: "everyone",
                                allowFriendRequests: "everyone",
                                showOnline: true
                            }
                        }
                    };

                    try {
                        await createSupabaseUser(user);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            400
                        );
                        return;
                    }

                    // Keep the JSON mirror for the existing Vibe features
                    // (friends, groups, channels, messages, etc.).
                    const users = getUsers();
                    users.push(user);
                    saveJSON(USERS_FILE, users);

                    sendJSON(
                        res,
                        {
                            success: true,
                            user: publicUser(user, login)
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
                        String(body.login || "").trim();

                    const password =
                        String(body.password || "");

                    if (!login || !password) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Введите логин и пароль"
                            },
                            400
                        );
                        return;
                    }

                    let row;

                    try {
                        row = await getSupabaseUser(login);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    if (!row || row.password !== password) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Неверный логин или пароль"
                            },
                            401
                        );
                        return;
                    }

                    // Load the existing local data so friends/privacy/etc.
                    // keep working, then refresh account/profile fields
                    // from Supabase.
                    const users = getUsers();
                    let user = users.find(
                        item => item.login === row.login
                    );

                    if (!user) {
                        user = {
                            login: row.login,
                            password: row.password,
                            friends: [],
                            friendRequestsIncoming: [],
                            friendRequestsOutgoing: [],
                            contacts: [],
                            blockedUsers: [],
                            profile: {}
                        };
                        normalizeUser(user);
                        users.push(user);
                    }

                    applySupabaseUserToLocalUser(user, row);
                    saveJSON(USERS_FILE, users);

                    sendJSON(
                        res,
                        {
                            success: true,
                            user: publicUser(user, login)
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
                        String(body.login || "").trim();

                    const currentPassword =
                        String(body.currentPassword || "");

                    const newPassword =
                        String(body.newPassword || "");

                    if (!login || !currentPassword || !newPassword) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Заполните все поля"
                            },
                            400
                        );
                        return;
                    }

                    if (newPassword.length < 4) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Новый пароль должен содержать минимум 4 символа"
                            },
                            400
                        );
                        return;
                    }

                    if (newPassword.length > 200) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Новый пароль слишком длинный"
                            },
                            400
                        );
                        return;
                    }

                    let row;

                    try {
                        row = await getSupabaseUser(login);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    if (!row) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Пользователь не найден"
                            },
                            404
                        );
                        return;
                    }

                    if (row.password !== currentPassword) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Текущий пароль указан неправильно"
                            },
                            401
                        );
                        return;
                    }

                    if (currentPassword === newPassword) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Новый пароль должен отличаться от текущего"
                            },
                            400
                        );
                        return;
                    }

                    try {
                        await updateSupabaseUser(
                            login,
                            { password: newPassword }
                        );
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    const users = getUsers();
                    const user = users.find(
                        item => item.login === login
                    );

                    if (user) {
                        user.password = newPassword;
                        saveJSON(USERS_FILE, users);
                    }

                    sendJSON(
                        res,
                        {
                            success: true,
                            message: "Пароль успешно изменён"
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
                            url.searchParams.get("login") || ""
                        );

                    const viewer =
                        String(
                            url.searchParams.get("viewer") || ""
                        );

                    let row;

                    try {
                        row = await getSupabaseUser(login);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    if (!row) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Пользователь не найден"
                            },
                            404
                        );
                        return;
                    }

                    const users = getUsers();
                    let user = users.find(
                        item => item.login === row.login
                    );

                    if (!user) {
                        user = {
                            login: row.login,
                            password: row.password || "",
                            friends: [],
                            friendRequestsIncoming: [],
                            friendRequestsOutgoing: [],
                            contacts: [],
                            blockedUsers: [],
                            profile: {}
                        };
                        normalizeUser(user);
                        users.push(user);
                    }

                    applySupabaseUserToLocalUser(user, row);
                    saveJSON(USERS_FILE, users);

                    sendJSON(
                        res,
                        {
                            success: true,
                            user: publicUser(user, viewer)
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
                        String(body.login || "").trim();

                    let row;

                    try {
                        row = await getSupabaseUser(login);
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    if (!row) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: "Пользователь не найден"
                            },
                            404
                        );
                        return;
                    }

                    const users = getUsers();

                    let user = users.find(
                        item => item.login === login
                    );

                    if (!user) {
                        user = {
                            login,
                            password: row.password || "",
                            friends: [],
                            friendRequestsIncoming: [],
                            friendRequestsOutgoing: [],
                            contacts: [],
                            blockedUsers: [],
                            profile: {}
                        };
                        normalizeUser(user);
                        users.push(user);
                    }

                    applySupabaseUserToLocalUser(user, row);
                    normalizeUser(user);

                    const supabaseChanges = {};

                    if (typeof body.name === "string") {
                        user.profile.name =
                            body.name.trim().slice(0, 60) || user.login;
                        supabaseChanges.name = user.profile.name;
                    }

                    if (typeof body.about === "string") {
                        user.profile.about =
                            body.about.trim().slice(0, 500);
                        supabaseChanges.about = user.profile.about;
                    }

                    if (typeof body.photo === "string") {
                        user.profile.photo = body.photo.trim();
                        supabaseChanges.photo = user.profile.photo;
                    }

                    if (typeof body.background === "string") {
                        user.profile.background =
                            body.background.trim().slice(0, 2000000);
                        supabaseChanges.background = user.profile.background;
                    }

                    if (
                        body.language === "ru" ||
                        body.language === "en"
                    ) {
                        user.profile.language = body.language;
                        supabaseChanges.language = body.language;
                    }

                    if (typeof body.email === "string") {
                        user.profile.email =
                            body.email.trim().slice(0, 150);
                        supabaseChanges.email = user.profile.email;
                    }

                    if (typeof body.birthDate === "string") {
                        user.profile.birthDate =
                            body.birthDate.trim();
                        supabaseChanges.birth_date =
                            user.profile.birthDate || null;
                    }

                    if (typeof body.messageStyle === "string") {
                        const allowedStyles = [
                            "classic",
                            "square",
                            "neon"
                        ];

                        if (allowedStyles.includes(body.messageStyle)) {
                            user.profile.messageStyle =
                                body.messageStyle;
                        }
                    }

                    if (
                        body.privacy &&
                        typeof body.privacy === "object"
                    ) {

                        const allowed = [
                            "everyone",
                            "friends",
                            "nobody"
                        ];

                        Object.keys(body.privacy).forEach(key => {

                            if (
                                [
                                    "profile",
                                    "birthDate",
                                    "age",
                                    "photo",
                                    "about"
                                ].includes(key) &&
                                allowed.includes(body.privacy[key])
                            ) {
                                user.profile.privacy[key] =
                                    body.privacy[key];
                            }
                        });

                        if (
                            ["everyone", "friends", "nobody"].includes(
                                body.privacy.allowFriendRequests
                            )
                        ) {
                            user.profile.privacy.allowFriendRequests =
                                body.privacy.allowFriendRequests;
                        }

                        if (
                            typeof body.privacy.allowFriendRequests ===
                            "boolean"
                        ) {
                            user.profile.privacy.allowFriendRequests =
                                body.privacy.allowFriendRequests
                                    ? "everyone"
                                    : "nobody";
                        }

                        if (
                            typeof body.privacy.showOnline ===
                            "boolean"
                        ) {
                            user.profile.privacy.showOnline =
                                body.privacy.showOnline;
                        }
                    }

                    try {
                        if (Object.keys(supabaseChanges).length > 0) {
                            const updated =
                                await updateSupabaseUser(
                                    login,
                                    supabaseChanges
                                );

                            if (updated) {
                                applySupabaseUserToLocalUser(
                                    user,
                                    updated
                                );
                            }
                        }
                    } catch (error) {
                        sendJSON(
                            res,
                            {
                                success: false,
                                message: error.message
                            },
                            500
                        );
                        return;
                    }

                    // Keep JSON mirror for the rest of Vibe.
                    saveJSON(USERS_FILE, users);

                    sendJSON(
                        res,
                        {
                            success: true,
                            user: publicUser(user, login)
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
                        ).trim();


                    if (!login) {
                        sendJSON(res, []);
                        return;
                    }


                    // Load messages and all Supabase users in parallel.
                    // This is important on Render: the other user may not
                    // exist in users.json after a deploy, even though the
                    // account is already registered in Supabase.
                    const [messages, supabaseUsers] =
                        await Promise.all([
                            getPersistentMessages(),
                            getSupabaseUsersMap()
                        ]);


                    const localUsers =
                        getUsers();


                    const localUsersMap =
                        new Map(
                            localUsers.map(
                                user => [
                                    String(user.login),
                                    user
                                ]
                            )
                        );


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


                            if (!other || other === login) {
                                return;
                            }


                            const previous =
                                map.get(other);


                            if (
                                !previous ||
                                new Date(
                                    message.time
                                ) >
                                new Date(
                                    previous.time
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

                                    // Prefer the local record because it
                                    // contains friends/contacts/privacy
                                    // state. If it is missing, fall back to
                                    // the persistent Supabase account.
                                    let user =
                                        localUsersMap.get(other);

                                    if (!user) {
                                        user =
                                            supabaseRowToLocalUser(
                                                supabaseUsers.get(other)
                                            );
                                    }


                                    // A message can only be shown as a chat
                                    // when we can resolve the recipient.
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
                                                    last.type === "attachment"
                                                        ? "📎 " + (last.attachmentName || "Вложение")
                                                        : (
                                                            last.text ||
                                                            ""
                                                        )
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
                                                !(
                                                    Array.isArray(
                                                        m.deletedFor
                                                    ) &&
                                                    m.deletedFor.includes(
                                                        login
                                                    )
                                                )
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
                        await getPersistentMessages();


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
                        ).trim().slice(0, 5000);


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

                        reactions: {},

                        time:
                            new Date()
                                .toISOString()
                    };


                    await insertPersistentMessage(message);


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
                   MESSAGE REACTIONS
                ===================================================== */
                if (req.method === "POST" && pathname === "/message-reaction") {
                    const body = await getBody(req);
                    const login = String(body.login || "").trim();
                    const messageId = String(body.messageId || "").trim();
                    const emoji = String(body.emoji || "").trim();
                    const allowed = ["❤️","😂","👍","🔥","😮","😢"];
                    if (!login || !messageId || !allowed.includes(emoji)) {
                        sendJSON(res,{success:false,message:"Некорректная реакция"},400);
                        return;
                    }
                    if (!findUser(login)) {
                        sendJSON(res,{success:false,message:"Пользователь не найден"},404);
                        return;
                    }
                    const messages = await getPersistentMessages();
                    const message = messages.find(m => String(m.id) === messageId);
                    if (!message) {
                        sendJSON(res,{success:false,message:"Сообщение не найдено"},404);
                        return;
                    }
                    const directAllowed = message.groupId
                        ? (() => { const g=getGroups().find(x=>x.id===message.groupId); return !!g && g.members.includes(login); })()
                        : (message.from === login || message.to === login);
                    if (!directAllowed) {
                        sendJSON(res,{success:false,message:"Нет доступа"},403);
                        return;
                    }
                    if (!message.reactions || typeof message.reactions !== "object") message.reactions = {};
                    const hadSelectedReaction = Array.isArray(message.reactions[emoji]) && message.reactions[emoji].includes(login);
                    for (const key of Object.keys(message.reactions)) {
                        if (!Array.isArray(message.reactions[key])) message.reactions[key] = [];
                        message.reactions[key] = message.reactions[key].filter(x => x !== login);
                    }
                    if (!hadSelectedReaction) {
                        if (!message.reactions[emoji]) message.reactions[emoji] = [];
                        message.reactions[emoji].push(login);
                    }
                    Object.keys(message.reactions).forEach(k => { if (!message.reactions[k].length) delete message.reactions[k]; });
                    await updatePersistentMessage(message);

                    if (message.groupId) {
                        const group=getGroups().find(g=>g.id===message.groupId);
                        group?.members?.forEach(member => sendToUser(member,{type:"message-reaction",message}));
                    } else {
                        sendToUser(message.from,{type:"message-reaction",message});
                        sendToUser(message.to,{type:"message-reaction",message});
                    }
                    sendJSON(res,{success:true,message});
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
                    const messages = await getPersistentMessages();
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

                    await updatePersistentMessage(message);
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
                   PUBLIC GROUP SEARCH
                ===================================================== */

                if (req.method === "GET" && pathname === "/group-search") {
                    const login = String(url.searchParams.get("login") || "");
                    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();

                    if (!query) {
                        sendJSON(res, []);
                        return;
                    }

                    const result = getGroups()
                        .map(normalizeGroup)
                        .filter(group => group.settings.public !== false)
                        .filter(group => {
                            const haystack = [
                                group.name,
                                group.description,
                                group.id
                            ].join(" ").toLowerCase();
                            return haystack.includes(query);
                        })
                        .slice(0, 30)
                        .map(group => ({
                            id: group.id,
                            name: group.name,
                            description: group.description,
                            photo: group.photo,
                            joined: group.members.includes(login),
                            memberCount: group.members.length,
                            owner: group.owner
                        }));

                    sendJSON(res, result);
                    return;
                }

                /* =====================================================
                   JOIN PUBLIC GROUP
                ===================================================== */

                if (req.method === "POST" && pathname === "/group-join") {
                    const body = await getBody(req);
                    const login = String(body.login || "").trim();
                    const groupId = String(body.groupId || "").trim();

                    if (!login || !findUser(login)) {
                        sendJSON(res, {success:false, message:"Пользователь не найден"}, 404);
                        return;
                    }

                    const groups = getGroups();
                    const group = groups.find(g => g.id === groupId);

                    if (!group) {
                        sendJSON(res, {success:false, message:"Группа не найдена"}, 404);
                        return;
                    }

                    normalizeGroup(group);

                    if (group.settings.public === false) {
                        sendJSON(res, {success:false, message:"Эта группа закрытая"}, 403);
                        return;
                    }

                    if (!group.members.includes(login)) {
                        group.members.push(login);
                    }

                    saveJSON(GROUPS_FILE, groups);
                    sendJSON(res, {success:true, group});
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
                    const photo = String(body.photo || "").trim().slice(0, 6000000);
                    const isPublic = body.public !== false;

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
                        settings:{public:isPublic},
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
                    const target = String(body.target || "").trim().replace(/^@+/, "");
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
                        if (target === group.owner) {
                            sendJSON(res, {success:false, message:"Создателя группы нельзя удалить"}, 400);
                            return;
                        }
                        group.members = group.members.filter(x => x !== target);
                        group.admins = group.admins.filter(x => x !== target);
                    }

                    saveJSON(GROUPS_FILE, groups);
                    sendJSON(res, {success:true, group});
                    return;
                }


                /* =====================================================
                   GROUP SETTINGS
                ===================================================== */

                if (req.method === "POST" && pathname === "/group-update") {
                    const body = await getBody(req);
                    const groupId = String(body.groupId || "").trim();
                    const owner = String(body.owner || "").trim();
                    const groups = getGroups();
                    const group = groups.find(g => g.id === groupId);

                    if (!group) {
                        sendJSON(res, {success:false, message:"Группа не найдена"}, 404);
                        return;
                    }

                    normalizeGroup(group);

                    if (group.owner !== owner) {
                        sendJSON(res, {success:false, message:"Только создатель группы может изменять настройки"}, 403);
                        return;
                    }

                    if (typeof body.name === "string") {
                        const name = body.name.trim().slice(0, 80);
                        if (!name) {
                            sendJSON(res, {success:false, message:"Введите название группы"}, 400);
                            return;
                        }
                        group.name = name;
                    }

                    if (typeof body.description === "string") {
                        group.description = body.description.trim().slice(0, 500);
                    }

                    if (typeof body.photo === "string") {
                        const photo = body.photo.trim();
                        if (photo && !photo.startsWith("data:image/")) {
                            sendJSON(res, {success:false, message:"Некорректное фото группы"}, 400);
                            return;
                        }
                        group.photo = photo;
                    }

                    if (typeof body.public === "boolean") {
                        group.settings.public = body.public;
                    }

                    saveJSON(GROUPS_FILE, groups);
                    sendJSON(res, {
                        success:true,
                        group:normalizeGroup(group)
                    });
                    return;
                }

                if (req.method === "GET" && pathname === "/group-messages") {
                    const groupId = String(url.searchParams.get("groupId") || "");
                    const login = String(url.searchParams.get("login") || "");
                    const postId = String(url.searchParams.get("postId") || "");
                    const group = getGroups().find(g => g.id === groupId);
                    if (!group || !group.members.includes(login)) {
                        sendJSON(res, [], 403);
                        return;
                    }
                    const messages = (await getPersistentMessages())
                        .filter(m =>
                            m.groupId === groupId &&
                            (!postId || String(m.postId || "") === postId) &&
                            !(
                                Array.isArray(m.deletedFor) && m.deletedFor.includes(login)
                            ) &&
                            !m.deletedForAll
                        );
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
                    const postId = String(body.postId || "").trim().slice(0,180);
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
                        postId,
                        text:type === "text" ? text : "",
                        audio:type === "voice" ? audio : "",
                        duration:type === "voice" ? duration : 0,
                        attachment:type === "attachment" ? attachment : "",
                        attachmentType:type === "attachment" ? attachmentType : "",
                        attachmentName:type === "attachment" ? attachmentName : "",
                        replyTo,
                        time:new Date().toISOString()
                    };
                    await insertPersistentMessage(message);

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
                        const photo = body.photo.trim();
                        if (photo && !photo.startsWith("data:image/")) {
                            sendJSON(res,{success:false,message:"Некорректное фото канала"},400);
                            return;
                        }
                        if (photo.length > 4_000_000) {
                            sendJSON(res,{success:false,message:"Фото канала слишком большое"},413);
                            return;
                        }
                        channel.photo = photo;
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

                    if (typeof body.public === "boolean") {
                        channel.settings.public = body.public;
                    }

                    /*
                     * A discussion group is optional. Only a group in which
                     * the channel owner is an admin can be attached.
                     * One group may belong to only one channel.
                     */
                    if (typeof body.discussionGroupId === "string") {
                        const discussionGroupId = body.discussionGroupId.trim();

                        if (!discussionGroupId) {
                            channel.discussionGroupId = "";
                        } else {
                            const groups = getGroups();
                            const group = groups.find(g => g.id === discussionGroupId);

                            if (!group) {
                                sendJSON(res, {
                                    success:false,
                                    message:"Группа не найдена или недоступна"
                                }, 404);
                                return;
                            }

                            normalizeGroup(group);

                            if (!group.admins.includes(channel.owner)) {
                                sendJSON(res, {
                                    success:false,
                                    message:"Владелец канала должен быть администратором этой группы"
                                }, 403);
                                return;
                            }

                            const alreadyLinked = channels.find(other =>
                                other.id !== channel.id &&
                                other.discussionGroupId === discussionGroupId
                            );

                            if (alreadyLinked) {
                                sendJSON(res, {
                                    success:false,
                                    message:"Эта группа уже подключена к другому каналу"
                                }, 409);
                                return;
                            }

                            channel.discussionGroupId = discussionGroupId;
                            channel.settings.comments = true;
                        }
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
                   CHANNEL DELETE
                   Deletes the channel itself and every publication/comment
                   stored with it. A linked discussion group is left intact
                   because it may be a separate user-owned group.
                ===================================================== */
                if (req.method === "POST" && pathname === "/channel-delete") {
                    const body = await getBody(req);
                    const channelId = String(body.channelId || "").trim();
                    const owner = String(body.owner || "").trim();
                    if (!channelId || !owner) {
                        sendJSON(res,{success:false,message:"Недостаточно данных"},400);
                        return;
                    }

                    const channels = readJSON(CHANNELS_FILE);
                    const channel = channels.find(c => String(c.id) === channelId);
                    if (!channel) {
                        sendJSON(res,{success:false,message:"Канал не найден"},404);
                        return;
                    }
                    if (channel.owner !== owner) {
                        sendJSON(res,{success:false,message:"Только владелец может удалить канал"},403);
                        return;
                    }

                    const recipients = Array.from(new Set([
                        ...(Array.isArray(channel.subscribers) ? channel.subscribers : []),
                        channel.owner
                    ].filter(Boolean)));

                    const filteredChannels = channels.filter(c => String(c.id) !== channelId);
                    saveJSON(CHANNELS_FILE, filteredChannels);

                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const filteredPosts = posts.filter(post => String(post.channelId) !== channelId);
                    saveJSON(CHANNEL_POSTS_FILE, filteredPosts);

                    recipients.forEach(login => sendToUser(login, {
                        type:"channel-deleted",
                        channelId
                    }));

                    sendJSON(res,{success:true,channelId});
                    return;
                }

                /* =====================================================
                   CHANNEL POST REACTION
                ===================================================== */
                if (req.method === "POST" && pathname === "/channel-post-reaction") {
                    const body = await getBody(req);
                    const channelId = String(body.channelId || "").trim();
                    const postId = String(body.postId || "").trim();
                    const login = String(body.login || "").trim();
                    const emoji = String(body.emoji || "").trim();
                    const allowed = ["❤️","😂","👍","🔥","😮","😢"];

                    if (!channelId || !postId || !login || !allowed.includes(emoji)) {
                        sendJSON(res,{success:false,message:"Некорректная реакция"},400);
                        return;
                    }
                    if (!findUser(login)) {
                        sendJSON(res,{success:false,message:"Пользователь не найден"},404);
                        return;
                    }

                    const channels = readJSON(CHANNELS_FILE);
                    const channel = channels.find(c => String(c.id) === channelId);
                    if (!channel) {
                        sendJSON(res,{success:false,message:"Канал не найден"},404);
                        return;
                    }

                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const post = posts.find(p => String(p.id) === postId && String(p.channelId) === channelId);
                    if (!post) {
                        sendJSON(res,{success:false,message:"Публикация не найдена"},404);
                        return;
                    }

                    if (!post.reactions || typeof post.reactions !== "object") post.reactions = {};
                    const hadReaction = Array.isArray(post.reactions[emoji]) && post.reactions[emoji].includes(login);
                    Object.keys(post.reactions).forEach(key => {
                        if (!Array.isArray(post.reactions[key])) post.reactions[key] = [];
                        post.reactions[key] = post.reactions[key].filter(item => item !== login);
                    });
                    if (!hadReaction) {
                        if (!post.reactions[emoji]) post.reactions[emoji] = [];
                        post.reactions[emoji].push(login);
                    }
                    Object.keys(post.reactions).forEach(key => {
                        if (!post.reactions[key].length) delete post.reactions[key];
                    });

                    saveJSON(CHANNEL_POSTS_FILE, posts);

                    const recipients = Array.from(new Set([
                        ...(Array.isArray(channel.subscribers) ? channel.subscribers : []),
                        channel.owner
                    ].filter(Boolean)));
                    recipients.forEach(target => sendToUser(target, {
                        type:"channel-post-reaction",
                        channelId,
                        postId,
                        post
                    }));

                    sendJSON(res,{success:true,post});
                    return;
                }

                /* =====================================================
                   CHANNEL POLL VOTE
                ===================================================== */
                if (req.method === "POST" && pathname === "/channel-poll-vote") {
                    const body = await getBody(req);
                    const channelId = String(body.channelId || "").trim();
                    const postId = String(body.postId || "").trim();
                    const login = String(body.login || "").trim();
                    const optionId = String(body.optionId || "").trim();

                    if (!channelId || !postId || !login || optionId === "") {
                        sendJSON(res,{success:false,message:"Некорректный голос"},400);
                        return;
                    }
                    if (!findUser(login)) {
                        sendJSON(res,{success:false,message:"Пользователь не найден"},404);
                        return;
                    }

                    const channels = readJSON(CHANNELS_FILE);
                    const channel = channels.find(c => String(c.id) === channelId);
                    if (!channel) {
                        sendJSON(res,{success:false,message:"Канал не найден"},404);
                        return;
                    }

                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const post = posts.find(p => String(p.id) === postId && String(p.channelId) === channelId);
                    if (!post || !post.poll) {
                        sendJSON(res,{success:false,message:"Опрос не найден"},404);
                        return;
                    }

                    if (!Array.isArray(post.poll.options) || !post.poll.options.some(o => String(o.id) === optionId)) {
                        sendJSON(res,{success:false,message:"Вариант не найден"},400);
                        return;
                    }
                    if (!post.poll.voters || typeof post.poll.voters !== "object") post.poll.voters = {};

                    const previous = post.poll.voters[login];
                    if (previous !== undefined && String(previous) === optionId) {
                        sendJSON(res,{success:true,post});
                        return;
                    }

                    if (previous !== undefined) {
                        const oldOption = post.poll.options.find(o => String(o.id) === String(previous));
                        if (oldOption) oldOption.votes = Math.max(0, Number(oldOption.votes || 0) - 1);
                    }

                    const selected = post.poll.options.find(o => String(o.id) === optionId);
                    if (selected) selected.votes = Number(selected.votes || 0) + 1;
                    post.poll.voters[login] = optionId;

                    saveJSON(CHANNEL_POSTS_FILE, posts);

                    const recipients = Array.from(new Set([
                        ...(Array.isArray(channel.subscribers) ? channel.subscribers : []),
                        channel.owner
                    ].filter(Boolean)));
                    recipients.forEach(target => sendToUser(target, {
                        type:"channel-poll-vote",
                        channelId,
                        postId,
                        post
                    }));

                    sendJSON(res,{success:true,post});
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
                    const text = String(body.text || "").trim().slice(0,1000);
                    const media = String(body.media || "").trim();
                    const mediaType = String(body.mediaType || "").trim().slice(0,100);
                    const channels = readJSON(CHANNELS_FILE);
                    const channel = channels.find(c => c.id === channelId);
                    if (!channel) { sendJSON(res,{success:false,message:"Канал не найден"},404); return; }
                    if (channel.settings && channel.settings.comments === false) { sendJSON(res,{success:false,message:"Комментарии отключены"},403); return; }
                    if (!findUser(author) || (!text && !media)) { sendJSON(res,{success:false,message:"Комментарий пустой"},400); return; }
                    if (media && media.length > 16 * 1024 * 1024) { sendJSON(res,{success:false,message:"Файл комментария слишком большой"},413); return; }
                    const posts = readJSON(CHANNEL_POSTS_FILE);
                    const post = posts.find(p => p.id === postId && p.channelId === channelId);
                    if (!post) { sendJSON(res,{success:false,message:"Публикация не найдена"},404); return; }
                    if (!Array.isArray(post.comments)) post.comments=[];
                    const u=findUser(author);
                    const comment={id:Date.now().toString()+Math.random().toString(36).slice(2),author,name:u.name||author,text,media,mediaType,time:new Date().toISOString()};
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

                    const rawPoll = body.poll && typeof body.poll === "object"
                        ? body.poll
                        : null;
                    let poll = null;

                    if (rawPoll) {
                        const question = String(rawPoll.question || "").trim().slice(0, 300);
                        const rawOptions = Array.isArray(rawPoll.options) ? rawPoll.options : [];
                        const options = rawOptions
                            .map(value => String(value || "").trim().slice(0, 120))
                            .filter(Boolean)
                            .slice(0, 10);

                        if (question && options.length >= 2) {
                            poll = {
                                question,
                                options: options.map((option, index) => ({
                                    id: String(index),
                                    text: option,
                                    votes: 0
                                })),
                                voters: {}
                            };
                        }
                    }

                    if (
                        !text &&
                        !media &&
                        !poll
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
                        poll,
                        reactions: {},
                        views: 0,
                        viewers: [],
                        comments: [],

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