// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAuEXlVBeDytkDix6s244n49zZOhRWQDhI",
    authDomain: "srcteachersleave.firebaseapp.com",
    projectId: "srcteachersleave",
    storageBucket: "srcteachersleave.firebasestorage.app",
    messagingSenderId: "59380429182",
    appId: "1:59380429182:web:a943eb61782207f763832f",
    measurementId: "G-KREEKD65QT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence for better performance
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Multiple tabs open, persistence enabled in first tab only');
        } else if (err.code == 'unimplemented') {
            console.log('Browser doesn\'t support persistence');
        }
    });
