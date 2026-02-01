require('dotenv').config(); // Load environment variables

const express = require('express');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const MongoStore = require('connect-mongo');
const Razorpay = require('razorpay'); // Razorpay SDK
const crypto = require('crypto'); // For payment verification

const app = express();
const PORT = process.env.PORT || 3000;

// FIXED: Validate required environment variables INCLUDING SESSION_SECRET
const requiredEnvVars = [
    'GOOGLE_CLIENT_ID', 
    'GOOGLE_CLIENT_SECRET', 
    'GOOGLE_CALLBACK_URL',
    'SESSION_SECRET',  // FIXED: Now required, no hardcoded fallback
    'RAZOR_PAY_KEY_ID',
    'RAZOR_PAY_KEY_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
    console.error('Please set these variables in your .env file');
    process.exit(1);
}

// FIXED: Warn if MONGO_URI is missing (optional but recommended)
if (!process.env.MONGO_URI) {
    console.warn('⚠️  WARNING: MONGO_URI not set. Sessions will use memory store.');
    console.warn('   This is NOT recommended for production - sessions will be lost on restart.');
}

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FIXED: Better MongoDB store initialization
let sessionStore;
if (process.env.MONGO_URI) {
    try {
        sessionStore = MongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            collectionName: 'sessions',
            touchAfter: 24 * 3600 // Lazy session update
        });
        console.log('✅ MongoDB session store initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing MongoStore:', error.message);
        
        // FIXED: Exit in production if MongoDB fails
        if (process.env.NODE_ENV === 'production') {
            console.error('Cannot use memory store in production. Exiting...');
            process.exit(1);
        }
        console.warn('⚠️  Falling back to memory store (development only)');
    }
} else {
    // FIXED: Exit in production if MONGO_URI not provided
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ MONGO_URI is required in production. Exiting...');
        process.exit(1);
    }
    console.warn('⚠️  Using memory store for sessions (not recommended)');
}

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET, // FIXED: No fallback - must be set
    resave: false,
    saveUninitialized: false, // FIXED: Changed to false for better security
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
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
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email'],
    passReqToCallback: false,
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// ==================== RAZORPAY SETUP ====================
// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZOR_PAY_KEY_ID,
    key_secret: process.env.RAZOR_PAY_KEY_SECRET
});

console.log('✅ Razorpay initialized successfully');
// ========================================================

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Google authentication route
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google authentication callback route
app.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/',
        session: true,
    }),
    (req, res) => {
        console.log("✅ Successfully authenticated user:", req.user.displayName);
        res.redirect('/profile');
    }
);

// Profile route (requires authentication)
app.get('/profile', (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user;
        const name = user.displayName;
        const email = user.emails ? user.emails[0].value : 'No Email';
        const photo = user.photos ? user.photos[0].value : '/default-avatar.png';

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Profile - GroceryBucket</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                        text-align: center;
                        background: linear-gradient(to right, rgb(2, 39, 32), rgb(11, 109, 59));
                        color: white;
                    }
                    img {
                        border-radius: 50%;
                        width: 100px;
                        margin: 20px 0;
                    }
                    .btn {
                        background-color: #ffc107;
                        color: black;
                        padding: 10px 20px;
                        text-decoration: none;
                        border-radius: 5px;
                        display: inline-block;
                        margin-top: 20px;
                    }
                    .btn:hover {
                        background-color: #ffb300;
                    }
                    a {
                        color: #ffc107;
                    }
                </style>
            </head>
            <body>
                <h1>Welcome, ${name}!</h1>
                <img src="${photo}" alt="Profile Photo">
                <p><strong>Email:</strong> ${email}</p>
                <a href="/logout" class="btn">Logout</a>
                <br><br>
                <a href="/">← Back to Home</a>
            </body>
            </html>
        `);
    } else {
        res.redirect('/');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('❌ Logout error:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

// ==================== RAZORPAY ROUTES ====================

// Route 1: Get Razorpay Key ID (for frontend)
app.get('/api/razorpay/key', (req, res) => {
    res.json({
        key: process.env.RAZOR_PAY_KEY_ID
    });
});

// Route 2: Create Razorpay Order
app.post('/api/razorpay/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt } = req.body;

        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }

        // Create order options
        const options = {
            amount: amount * 100, // Convert to paise (Razorpay expects amount in smallest currency unit)
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1 // Auto capture payment
        };

        // Create order
        const order = await razorpayInstance.orders.create(options);

        console.log('✅ Razorpay order created:', order.id);

        res.json({
            success: true,
            order: order
        });

    } catch (error) {
        console.error('❌ Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route 3: Verify Razorpay Payment
app.post('/api/razorpay/verify-payment', (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                error: 'Missing payment verification parameters'
            });
        }

        // Create signature for verification
        const sign = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZOR_PAY_KEY_SECRET)
            .update(sign.toString())
            .digest('hex');

        // Compare signatures
        if (razorpay_signature === expectedSign) {
            console.log('✅ Payment verified successfully:', razorpay_payment_id);
            
            // TODO: Here you can save the payment details to your database
            // Example: Save order, update user's order history, etc.

            return res.json({
                success: true,
                message: 'Payment verified successfully',
                payment_id: razorpay_payment_id,
                order_id: razorpay_order_id
            });
        } else {
            console.error('❌ Payment verification failed - signature mismatch');
            return res.status(400).json({
                success: false,
                error: 'Invalid payment signature'
            });
        }

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================================

// 404 Error handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// FIXED: Improved error handler - hide details in production
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    
    // FIXED: Only expose detailed errors in development
    const errorResponse = {
        error: process.env.NODE_ENV === 'production' 
            ? 'An error occurred'  // Generic message for production
            : err.message,          // Detailed message for development
        status: err.status || 500
    };
    
    res.status(err.status || 500).json(errorResponse);
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`✅ Server is listening on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
    process.exit(1);
});

// FIXED: Better unhandled rejection handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    
    // FIXED: Graceful shutdown in production
    if (process.env.NODE_ENV === 'production') {
        console.error('Shutting down server due to unhandled rejection...');
        server.close(() => {
            process.exit(1);
        });
    }
});

// FIXED: Graceful shutdown on uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error('Shutting down server...');
    
    server.close(() => {
        process.exit(1);
    });
});

// FIXED: Added graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('📝 SIGTERM received, closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n📝 SIGINT received, closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});