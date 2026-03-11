// Auth state observer
auth.onAuthStateChanged(async (user) => {
    const currentPage = window.location.pathname.split('/').pop();
    const publicPages = ['index.html', ''];
    
    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Store user data in session
                sessionStorage.setItem('user', JSON.stringify({
                    uid: user.uid,
                    ...userData
                }));
                
                // Redirect based on role
                if (userData.role === 'admin' && currentPage !== 'admin.html') {
                    window.location.href = 'admin.html';
                } else if (userData.role === 'teacher' && currentPage !== 'teacher.html') {
                    window.location.href = 'teacher.html';
                }
            } else {
                await auth.signOut();
                if (!publicPages.includes(currentPage)) {
                    window.location.href = 'index.html';
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            if (!publicPages.includes(currentPage)) {
                window.location.href = 'index.html';
            }
        }
    } else {
        sessionStorage.removeItem('user');
        if (!publicPages.includes(currentPage)) {
            window.location.href = 'index.html';
        }
    }
});

// Login function
async function login(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        let message = 'Login failed';
        switch (error.code) {
            case 'auth/user-not-found':
                message = 'User not found';
                break;
            case 'auth/wrong-password':
                message = 'Invalid password';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email format';
                break;
            case 'auth/too-many-requests':
                message = 'Too many failed attempts. Try again later.';
                break;
        }
        return { success: false, error: message };
    }
}

// Logout function
async function logout() {
    try {
        await auth.signOut();
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Failed to logout', 'error');
    }
}

// Update password
async function updatePassword(currentPassword, newPassword) {
    try {
        const user = auth.currentUser;
        const credential = firebase.auth.EmailAuthProvider.credential(
            user.email, 
            currentPassword
        );
        
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);
        
        return { success: true };
    } catch (error) {
        console.error('Password update error:', error);
        let message = 'Failed to update password';
        if (error.code === 'auth/wrong-password') {
            message = 'Current password is incorrect';
        }
        return { success: false, error: message };
    }
}