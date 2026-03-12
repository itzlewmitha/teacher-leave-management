// Authentication state observer
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Get user role from Firestore
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Store user data in session (not localStorage)
                sessionStorage.setItem('currentUser', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    name: userData.name,
                    role: userData.role
                }));

                // Redirect based on role
                const currentPage = window.location.pathname.split('/').pop();
                
                if (userData.role === 'admin' && currentPage !== 'admin.html') {
                    window.location.href = 'admin.html';
                } else if (userData.role === 'teacher' && currentPage !== 'teacher.html') {
                    window.location.href = 'teacher.html';
                }
            } else {
                // User document doesn't exist, sign out
                await firebase.auth().signOut();
                sessionStorage.removeItem('currentUser');
                if (window.location.pathname.split('/').pop() !== 'index.html') {
                    window.location.href = 'index.html';
                }
            }
        } catch (error) {
            console.error('Error checking user role:', error);
        }
    } else {
        // No user is signed in
        sessionStorage.removeItem('currentUser');
        if (window.location.pathname.split('/').pop() !== 'index.html' && 
            window.location.pathname !== '/') {
            window.location.href = 'index.html';
        }
    }
});

// Login function
async function login(email, password) {
    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Logout function
async function logout() {
    try {
        await firebase.auth().signOut();
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Get current user from session
function getCurrentUser() {
    const userStr = sessionStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Initialize login form
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorElement = document.getElementById('errorMessage');
            
            const result = await login(email, password);
            
            if (!result.success) {
                errorElement.textContent = result.error;
                errorElement.style.display = 'block';
            }
        });
    }
});