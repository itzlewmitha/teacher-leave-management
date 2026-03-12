// Admin state
let teachersUnsubscribe = null;
let leavesUnsubscribe = null;
let allTeachers = [];

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Set up real-time listeners
    setupTeachersListener();
    setupLeavesListener();
    
    // Initialize forms
    initializeCreateTeacherForm();
    
    // Update user info in sidebar
    updateUserInfo();
});

// Set up real-time teachers listener
function setupTeachersListener() {
    if (teachersUnsubscribe) {
        teachersUnsubscribe();
    }
    
    teachersUnsubscribe = db.collection('users')
        .where('role', '==', 'teacher')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
                    refreshTeachersData();
                }
            });
        }, (error) => {
            console.error('Teachers listener error:', error);
        });
}

// Set up real-time leaves listener
function setupLeavesListener() {
    if (leavesUnsubscribe) {
        leavesUnsubscribe();
    }
    
    leavesUnsubscribe = db.collection('leaveRequests')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    refreshAllData();
                }
            });
        }, (error) => {
            console.error('Leaves listener error:', error);
        });
}

// Refresh all data
async function refreshAllData() {
    await Promise.all([
        updateDashboardStats(),
        updateRecentLeaves(),
        updateLeaveRequests(),
        updateTeachersTable()
    ]);
}

// Refresh teachers data
async function refreshTeachersData() {
    await updateTeachersTable();
    await updateDashboardStats();
    await updateLeaveRequests(); // Update leave requests to refresh substitute teacher dropdown
}

// Update dashboard statistics
async function updateDashboardStats() {
    try {
        // Get total teachers
        const teachersSnapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .get();
        document.getElementById('totalTeachers').textContent = teachersSnapshot.size;
        
        // Get pending requests
        const pendingSnapshot = await db.collection('leaveRequests')
            .where('status', '==', 'pending')
            .get();
        document.getElementById('pendingRequests').textContent = pendingSnapshot.size;
        
        // Get today's approved leaves
        const today = new Date().toISOString().split('T')[0];
        const approvedSnapshot = await db.collection('leaveRequests')
            .where('status', '==', 'approved')
            .where('createdAt', '>=', today)
            .get();
        document.getElementById('approvedToday').textContent = approvedSnapshot.size;
        
        // Get active leaves (approved and current)
        const now = new Date().toISOString();
        const activeSnapshot = await db.collection('leaveRequests')
            .where('status', '==', 'approved')
            .where('startDate', '<=', now)
            .where('endDate', '>=', now)
            .get();
        document.getElementById('activeLeaves').textContent = activeSnapshot.size;
        
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

// Update recent leaves table
async function updateRecentLeaves() {
    const tbody = document.getElementById('recentLeavesBody');
    
    try {
        const snapshot = await db.collection('leaveRequests')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No leave requests found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const leave = doc.data();
            html += `
                <tr>
                    <td>${leave.teacherName || 'Unknown'}</td>
                    <td>${leave.leaveType || 'N/A'}</td>
                    <td>${formatDate(leave.startDate)} - ${formatDate(leave.endDate)}</td>
                    <td><span class="status-${leave.status}">${leave.status}</span></td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Error updating recent leaves:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Error loading data</td></tr>';
    }
}

// Update leave requests table
async function updateLeaveRequests() {
    const tbody = document.getElementById('leaveRequestsBody');
    const filter = document.getElementById('statusFilter')?.value || 'all';
    
    try {
        // Get all teachers for substitute dropdown
        const teachersSnapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .get();
        
        allTeachers = [];
        teachersSnapshot.forEach(doc => {
            allTeachers.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Get leave requests
        let query = db.collection('leaveRequests')
            .orderBy('createdAt', 'desc');
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No leave requests found</td></tr>';
            return;
        }
        
        let html = '';
        for (const doc of snapshot.docs) {
            const leave = { id: doc.id, ...doc.data() };
            
            // Apply filter
            if (filter !== 'all' && leave.status !== filter) {
                continue;
            }
            
            // Get available teachers (excluding current teacher if any)
            const availableTeachers = allTeachers.filter(t => t.id !== leave.teacherId);
            
            html += `
                <tr id="leave-${doc.id}">
                    <td>${leave.teacherName || 'Unknown'}</td>
                    <td>${leave.leaveType || 'N/A'}</td>
                    <td>${formatDate(leave.startDate)}</td>
                    <td>${formatDate(leave.endDate)}</td>
                    <td>${leave.reason || 'N/A'}</td>
                    <td>
                        ${leave.assignmentLink ? 
                            `<a href="${leave.assignmentLink}" target="_blank" class="assignment-link">View Assignment</a>` : 
                            'N/A'}
                    </td>
                    <td><span class="status-${leave.status}">${leave.status}</span></td>
                    <td>
                        ${leave.status === 'approved' && leave.substituteTeacherId ?
                            getTeacherName(leave.substituteTeacherId) :
                            leave.status === 'pending' ?
                            `<select class="teacher-select" id="substitute-${doc.id}" ${leave.status !== 'pending' ? 'disabled' : ''}>
                                <option value="">Select Substitute</option>
                                ${availableTeachers.map(t => 
                                    `<option value="${t.id}" ${t.id === leave.substituteTeacherId ? 'selected' : ''}>
                                        ${t.name}
                                    </option>`
                                ).join('')}
                            </select>` :
                            'N/A'
                        }
                    </td>
                    <td>
                        ${leave.status === 'pending' ? `
                            <div class="action-buttons">
                                <button onclick="approveLeave('${doc.id}')" class="btn btn-success btn-sm">Approve</button>
                                <button onclick="rejectLeave('${doc.id}')" class="btn btn-danger btn-sm">Reject</button>
                            </div>
                        ` : leave.status}
                    </td>
                </tr>
            `;
        }
        
        if (html === '') {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No matching records found</td></tr>';
        } else {
            tbody.innerHTML = html;
        }
        
    } catch (error) {
        console.error('Error updating leave requests:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Error loading data</td></tr>';
    }
}

// Update teachers table
async function updateTeachersTable() {
    const tbody = document.getElementById('teachersBody');
    
    try {
        const snapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No teachers found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const teacher = doc.data();
            html += `
                <tr>
                    <td>${teacher.name || 'N/A'}</td>
                    <td>${teacher.email || 'N/A'}</td>
                    <td>${teacher.totalLeaves || 14}</td>
                    <td>${teacher.remainingLeaves || 14}</td>
                    <td>${teacher.coverAssignmentsCount || 0}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Error updating teachers table:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading data</td></tr>';
    }
}

// Filter leave requests
function filterLeaveRequests() {
    updateLeaveRequests();
}

// Initialize create teacher form
function initializeCreateTeacherForm() {
    const form = document.getElementById('createTeacherForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const errorElement = document.getElementById('createError');
            const successElement = document.getElementById('createSuccess');
            
            // Hide previous messages
            errorElement.style.display = 'none';
            successElement.style.display = 'none';
            
            const name = document.getElementById('teacherName').value;
            const email = document.getElementById('teacherEmail').value;
            const password = document.getElementById('teacherPassword').value;
            
            try {
                // Create user in Firebase Authentication
                const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                
                // Create teacher document in Firestore
                await db.collection('users').doc(user.uid).set({
                    name: name,
                    email: email,
                    role: 'teacher',
                    totalLeaves: 14,
                    remainingLeaves: 14,
                    coverAssignmentsCount: 0,
                    createdAt: new Date().toISOString()
                });
                
                // Show success message
                successElement.textContent = 'Teacher account created successfully!';
                successElement.style.display = 'block';
                
                // Reset form
                form.reset();
                
                // Clear success message after 3 seconds
                setTimeout(() => {
                    successElement.style.display = 'none';
                }, 3000);
                
            } catch (error) {
                console.error('Error creating teacher:', error);
                errorElement.textContent = error.message;
                errorElement.style.display = 'block';
            }
        });
    }
}

// Approve leave request
async function approveLeave(leaveId) {
    try {
        // Get the selected substitute teacher
        const selectElement = document.getElementById(`substitute-${leaveId}`);
        const substituteTeacherId = selectElement ? selectElement.value : null;
        
        if (!substituteTeacherId) {
            alert('Please select a substitute teacher');
            return;
        }
        
        // Get leave request data
        const leaveDoc = await db.collection('leaveRequests').doc(leaveId).get();
        const leaveData = leaveDoc.data();
        
        // Calculate leave days
        const start = new Date(leaveData.startDate);
        const end = new Date(leaveData.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Start a batch write
        const batch = db.batch();
        
        // Update leave request
        const leaveRef = db.collection('leaveRequests').doc(leaveId);
        batch.update(leaveRef, {
            status: 'approved',
            substituteTeacherId: substituteTeacherId,
            approvedAt: new Date().toISOString()
        });
        
        // Update teacher's remaining leaves
        const teacherRef = db.collection('users').doc(leaveData.teacherId);
        batch.update(teacherRef, {
            remainingLeaves: firebase.firestore.FieldValue.increment(-days)
        });
        
        // Update substitute teacher's cover count
        const substituteRef = db.collection('users').doc(substituteTeacherId);
        batch.update(substituteRef, {
            coverAssignmentsCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Commit the batch
        await batch.commit();
        
    } catch (error) {
        console.error('Error approving leave:', error);
        alert('Error approving leave. Please try again.');
    }
}

// Reject leave request
async function rejectLeave(leaveId) {
    if (!confirm('Are you sure you want to reject this leave request?')) {
        return;
    }
    
    try {
        await db.collection('leaveRequests').doc(leaveId).update({
            status: 'rejected',
            rejectedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error rejecting leave:', error);
        alert('Error rejecting leave. Please try again.');
    }
}

// Get teacher name by ID
function getTeacherName(teacherId) {
    const teacher = allTeachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : teacherId;
}

// Update user info in sidebar
function updateUserInfo() {
    const user = getCurrentUser();
    if (user) {
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
            userInfo.innerHTML = `
                <span class="user-name">${user.name}</span>
                <span class="user-role">${user.role}</span>
            `;
        }
    }
}

// Show/hide sections
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Update active menu item
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Find and activate the clicked menu item
    const activeMenuItem = Array.from(document.querySelectorAll('.menu-item')).find(
        item => item.getAttribute('onclick')?.includes(sectionId)
    );
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    // Refresh data if needed
    if (sectionId === 'leave-requests') {
        updateLeaveRequests();
    } else if (sectionId === 'teachers') {
        updateTeachersTable();
    } else if (sectionId === 'dashboard') {
        refreshAllData();
    }
}

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
    if (teachersUnsubscribe) {
        teachersUnsubscribe();
    }
    if (leavesUnsubscribe) {
        leavesUnsubscribe();
    }
});

// Make functions global for onclick handlers
window.showSection = showSection;
window.logout = logout;
window.filterLeaveRequests = filterLeaveRequests;
window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;