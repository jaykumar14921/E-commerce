require('dotenv').config(); // Load environment variables

const express = require('express');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path'); // For handling file paths

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || '9f3c3e6f92ad4f6a9be9fda6749ae9e1a118d3f3035c3b127221e0ab6db0c2cb',
    resave: false,
    saveUninitialized: true,
    cookie: { // Added secure and sameSite attributes for production
        secure: process.env.NODE_ENV === 'production',  // Set to true in production
        sameSite: 'lax', // Or 'strict', depending on your needs
        httpOnly: true, // Prevents client-side JS access
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth 2.0 Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://e-commerce-irpp.onrender.com/auth/google/callback', // Use env variable
    scope: ['profile', 'email'], // Specify the data you want to access
    passReqToCallback: false, // Important:  Don't pass the req object if you don't need it
}, (accessToken, refreshToken, profile, done) => {
    // console.log("Google profile:", profile); // Debugging:  Check the profile data
    return done(null, profile); // Pass the user profile to the 'done' callback
}));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});


// Google authentication route
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google authentication callback route
app.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/', // Redirect to the home page on failure
        // successRedirect: '/profile', // Removed successRedirect here
        session: true, // Ensure session is maintained
    }),
    (req, res) => {
        // Successful authentication, redirect to profile or another page
        res.redirect('/profile'); //  moved success redirect here.
    }
);



// Serve static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// Profile route (requires authentication)
app.get('/profile', (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user;
        const name = user.displayName;
        const email = user.emails ? user.emails[0].value : 'No Email'; // Handle missing email
        const photo = user.photos ? user.photos[0].value : '/default-avatar.png'; // Handle missing photo

        res.send(`
            <h1>Welcome, ${name}</h1>
            <p>Email: ${email}</p>
            <img src="${photo}" alt="Profile Photo" style="border-radius:50%; width:100px;">
            <br><br>
            <a href="/logout">Logout</a>
        `);
    } else {
        res.redirect('/'); // Redirect to home if not authenticated
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout(() => { // Use the callback form of req.logout()
        res.redirect('/'); // Redirect to the home page after logout
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
