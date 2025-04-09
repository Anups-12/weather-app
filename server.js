const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const flash = require("connect-flash");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.set("view engine", "ejs");

app.use(session({
    secret: process.env.SESSION_SECRET || 'weatherSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 3600000 }
}));

app.use(flash());

// Make flash messages available in all views
app.use((req, res, next) => {
    res.locals.message = req.flash("message");
    next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((error) => console.error(`❌ MongoDB connection error: ${error}`));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    resetToken: String,
    resetTokenExpiration: Date
});
const User = mongoose.model("User", userSchema);

// Email Transporter
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Cache Control Middleware
const preventBack = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
};

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        req.flash("message", "Please login to access this page.");
        return res.redirect("/");
    }
    next();
};

// ROUTES

// Login Page
app.get("/", (req, res) => {
    res.render("login");
});

// Register Page
app.get("/register", (req, res) => {
    res.render("register");
});

// Register Handler
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

// Login Handler
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.flash("message", "Invalid email or password.");
            return res.redirect("/");
        }

        req.session.user = { id: user._id, email: user.email };
        res.redirect("/dashboard");
    } catch (error) {
        console.error(error);
        req.flash("message", "Login failed. Try again.");
        res.redirect("/");
    }
});

// Dashboard (WeatherAPI)
app.get("/dashboard", requireAuth, preventBack, async (req, res) => {
    const city = req.query.city || "Delhi";
    const apiKey = "57bf61198e014b2783374712250904";

    try {
        const response = await axios.get(`http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${city}&days=1&aqi=no&alerts=no`);
        const data = response.data;

        const weather = {
            city: data.location.name,
            region: data.location.region,
            country: data.location.country,
            temperature: data.current.temp_c,
            condition: data.current.condition.text,
            icon: data.current.condition.icon,
            humidity: data.current.humidity,
            windSpeed: data.current.wind_kph,
            feelslike: data.current.feelslike_c,
            uv: data.current.uv,
            pressure: data.current.pressure_mb,
            visibility: data.current.vis_km,
            cloud: data.current.cloud,
            last_updated: data.current.last_updated
        };

        const hourly = data.forecast.forecastday[0].hour.map(hour => ({
            time: hour.time,
            temp: hour.temp_c,
            condition: hour.condition,
            wind: hour.wind_kph,
            feelslike: hour.feelslike_c,
            humidity: hour.humidity,
            visibility: hour.vis_km,
            pressure: hour.pressure_mb,
            cloud: hour.cloud
        }));

        res.render("dashboard", { weather, hourly, error: null });
    } catch (error) {
        console.error("❌ Weather API Error:", error.message);
        res.render("dashboard", { weather: null, hourly: [], error: "Could not fetch weather data." });
    }
});

// Extra Pages
app.get("/about", requireAuth, preventBack, (req, res) => {
    res.render("about");
});

app.get("/services", requireAuth, preventBack, (req, res) => {
    res.render("services");
});

app.get("/contact", requireAuth, preventBack, (req, res) => {
    res.render("contact");
});

app.get("/faq", requireAuth, preventBack, (req, res) => {
    res.render("faq");
});

// Forgot Password
app.get("/forgot-password", (req, res) => {
    res.render("forgot-password");
});

app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            req.flash("message", "No account found with this email.");
            return res.redirect("/forgot-password");
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetToken = resetToken;
        user.resetTokenExpiration = Date.now() + 3600000;
        await user.save();

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

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.redirect("/");
    });
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
