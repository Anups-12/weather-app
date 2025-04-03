const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const flash = require("connect-flash");
const axios = require("axios");
const nodemailer = require("nodemailer");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors());
app.set("view engine", "ejs");

// ✅ Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'weatherSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 3600000 }
}));

app.use(flash());

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((error) => console.error(`❌ MongoDB connection error: ${error}`));

// ✅ User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);

// ✅ Email Transporter
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Cache Control Middleware
const preventBack = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
};

// ✅ Authentication Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    next();
};

// 🔥 ROUTES

// ✅ Home Route (Login Page)
app.get("/", (req, res) => {
    res.render("login", { message: req.flash("message") });
});

// ✅ Register Page
app.get("/register", (req, res) => {
    res.render("register", { message: req.flash("message") });
});

// ✅ Register Logic
app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            req.flash("message", "User already exists!");
            return res.redirect("/register");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        req.flash("message", "Registration successful! Please log in.");
        res.redirect("/");
    } catch (error) {
        console.error(error);
        req.flash("message", "Server error, try again.");
        res.redirect("/register");
    }
});

// ✅ Login Logic
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.flash("message", "Invalid email or password.");
            return res.redirect("/");
        }

        req.session.user = { id: user._id, email: user.email };

        // ✅ Redirect to the dashboard after successful login
        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        req.flash("message", "Server error, try again.");
        res.redirect("/");
    }
});

// ✅ Dashboard Route (Protected)
app.get("/dashboard", requireAuth, preventBack, async (req, res) => {
    const city = req.query.city || "Delhi";  // Default city after login
    const apiKey = process.env.OPENWEATHER_API_KEY;

    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
        );

        const weather = {
            city: response.data.name,
            temperature: response.data.main.temp,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            description: response.data.weather[0].description,
            icon: `https://openweathermap.org/img/wn/${response.data.weather[0].icon}.png`
        };

        res.render("dashboard", { weather, error: null });

    } catch (error) {
        console.error("❌ Weather API Error:", error.message);
        res.render("dashboard", { weather: null, error: "City not found or API error" });
    }
});

// ✅ Weather Search Route (Protected)
app.get("/weather", requireAuth, preventBack, async (req, res) => {
    const city = req.query.city || "Delhi"; 
    const apiKey = process.env.OPENWEATHER_API_KEY;

    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
        );

        const weather = {
            city: response.data.name,
            temperature: response.data.main.temp,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            description: response.data.weather[0].description,
            icon: `https://openweathermap.org/img/wn/${response.data.weather[0].icon}.png`
        };

        res.render("dashboard", { weather, error: null });

    } catch (error) {
        console.error("❌ Weather API Error:", error.message);
        res.render("dashboard", { weather: null, error: "City not found or API error" });
    }
});

// ✅ Logout Route
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");

        // ✅ Prevent Back Navigation
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.redirect("/");
    });
});


// ✅ Forgot Password Route (Render Form)
app.get("/forgot-password", (req, res) => {
    res.render("forgot-password", { message: req.flash("message") });
});

// ✅ Forgot Password Logic (Send Reset Link)
app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            req.flash("message", "No account found with this email.");
            return res.redirect("/forgot-password");
        }

        // ✅ Generate reset token and expiration time
        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetToken = resetToken;
        user.resetTokenExpiration = Date.now() + 3600000; // 1 hour expiration
        await user.save();

        // ✅ Send Reset Email
        const resetLink = `http://localhost:${PORT}/reset-password/${resetToken}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Password Reset",
            html: `
                <h3>You requested a password reset</h3>
                <p>Click the link below to reset your password:</p>
                <a href="${resetLink}">Reset Password</a>
                <p>This link will expire in 1 hour.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        req.flash("message", "Password reset link sent. Check your email.");
        res.redirect("/");
    } catch (error) {
        console.error("Error:", error);
        req.flash("message", "Failed to send reset email.");
        res.redirect("/forgot-password");
    }
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
