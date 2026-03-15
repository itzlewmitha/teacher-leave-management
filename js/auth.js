// ==================== FIXED auth.js - NO INFINITE LOOP ====================

// Track if we're already redirecting to prevent loops
let isRedirecting = false;

// Authentication state observer
firebase.auth().onAuthStateChanged(async (user) => {
    // Prevent multiple simultaneous redirects
    if (isRedirecting) {
        console.log('Already redirecting, skipping...');
        return;
    }
    
    try {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        console.log('Auth state changed. User:', user ? user.email : 'No user', 'Page:', currentPage);
        
        if (user) {
            // User is signed in
            try {
                // Get user role from Firestore
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    
                    // Store user data in session
                    sessionStorage.setItem('currentUser', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        name: userData.name,
                        role: userData.role
                    }));
                    
                    console.log('User data loaded:', userData.name, 'Role:', userData.role);
                    
                    // Only redirect if we're not already on the correct page
                    if (userData.role === 'admin' && currentPage !== 'admin.html') {
                        console.log('Redirecting to admin page...');
                        isRedirecting = true;
                        window.location.href = 'admin.html';
                        return;
                    } else if (userData.role === 'teacher' && currentPage !== 'teacher.html') {
                        console.log('Redirecting to teacher page...');
                        isRedirecting = true;
                        window.location.href = 'teacher.html';
                        return;
                    } else {
                        console.log('Already on correct page:', currentPage);
                    }
                } else {
                    // User document doesn't exist - should not happen for valid users
                    console.error('User document not found for:', user.uid);
                    await firebase.auth().signOut();
                    sessionStorage.removeItem('currentUser');
                    
                    if (currentPage !== 'index.html') {
                        isRedirecting = true;
                        window.location.href = 'index.html';
                    }
                }
            } catch (error) {
                console.error('Error checking user role:', error);
                // Don't redirect on error - stay on current page
            }
        } else {
            // No user is signed in
            console.log('No user signed in');
            sessionStorage.removeItem('currentUser');
            
            // Only redirect to index if we're on a protected page
            const protectedPages = ['admin.html', 'teacher.html'];
            if (protectedPages.includes(currentPage)) {
                console.log('Redirecting to login page...');
                isRedirecting = true;
                window.location.href = 'index.html';
            }
        }
    } catch (error) {
        console.error('Global auth error:', error);
    } finally {
        // Reset redirecting flag after a delay
        setTimeout(() => {
            isRedirecting = false;
        }, 1000);
    }
});

// Login function
async function login(email, password) {
    try {
        console.log('Attempting login for:', email);
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log('Login successful for:', email);
        
        // Don't redirect here - let the onAuthStateChanged handle it
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

// Logout function
async function logout() {
    try {
        console.log('Logging out...');
        isRedirecting = true; // Prevent any redirect loops during logout
        await firebase.auth().signOut();
        sessionStorage.removeItem('currentUser');
        
        // Force redirect to index
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        isRedirecting = false;
    }
}

// Get current user from session
function getCurrentUser() {
    try {
        const userStr = sessionStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
        console.error('Error parsing user from session:', error);
        return null;
    }
}

// Initialize login form
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // Remove any existing listeners to prevent duplicates
        const newForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newForm, loginForm);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorElement = document.getElementById('errorMessage');
            const submitBtn = newForm.querySelector('button[type="submit"]');
            
            // Disable button to prevent double submission
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
            
            // Hide previous error
            if (errorElement) {
                errorElement.style.display = 'none';
            }
            
            const result = await login(email, password);
            
            if (!result.success) {
                if (errorElement) {
                    errorElement.textContent = result.error;
                    errorElement.style.display = 'block';
                }
                // Re-enable button
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            }
            // On success, let onAuthStateChanged handle the redirect
        });
    }
});

// Add this to prevent any accidental double redirects
window.addEventListener('load', () => {
    // Reset redirecting flag on page load
    isRedirecting = false;
});