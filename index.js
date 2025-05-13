require('dotenv').config();

const express=require('express');
const passport=require('passport');
const session=require('express-session');
const GoogleStrategy=require('passport-google-oauth20').Strategy;

const app=express();
PORT=process.env.PORT || 3000;

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: 'https://e-commerce-irpp.onrender.com/auth/google/callback',
    },
   (accessToken,refeshToken,profile,done)=>{
    return done(null,profile);
   }));

passport.serializeUser((user,done)=>done(null,user));
passport.deserializeUser((user,done)=>done(null,user));

const path = require('path');

// Serve static files from /public folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(
    "/auth/google",
    passport.authenticate("google",{scope: ["profile", "email"] })
);

app.get("/auth/google/callback",passport.authenticate('google',{failureRedirect: "/"}),(req,res)=>{
    res.redirect('/profile');
});

app.get("/profile", (req, res) => {
  const user = req.user;
  const name = user.displayName;
  const email = user.emails[0].value;
  const photo = user.photos[0].value;

  res.send(`
    <h1>Welcome, ${name}</h1>
    <p>Email: ${email}</p>
    <img src="${photo}" alt="Profile Photo" style="border-radius:50%; width:100px;">
    <br><br>
    <a href="/logout">Logout</a>
  `);
});


// app.get("/profile",(req,res)=>{
//     res.send(`welcome ${req.user.display}`);
// });

app.get("/logout",(req,res)=>{
    req.logout(()=>{
      res.redirect("/");
});
   
});

app.listen(PORT,()=>{
    console.log(`Server is Listening on PORT ${PORT}`);
});