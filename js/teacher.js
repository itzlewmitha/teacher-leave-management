// Current teacher data
let currentTeacher = null;
let leavesUnsubscribe = null;

// Initialize teacher dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const user = getCurrentUser();
    if (!user || user.role !== 'teacher') {
        window.location.href = 'index.html';
        return;
    }

    // Load teacher data
    await loadTeacherData();
    
    // Set up real-time leave requests listener
    setupLeavesListener();
    
    // Initialize form
    initializeLeaveForm();
    
    // Update user info in sidebar
    updateUserInfo();
});

// Load teacher data from Firestore
async function loadTeacherData() {
    const user = getCurrentUser();
    try {
        const teacherDoc = await db.collection('users').doc(user.uid).get();
        if (teacherDoc.exists) {
            currentTeacher = {
                id: teacherDoc.id,
                ...teacherDoc.data()
            };
            updateStats();
        }
    } catch (error) {
        console.error('Error loading teacher data:', error);
    }
}

// Set up real-time leaves listener
function setupLeavesListener() {
    const user = getCurrentUser();
    
    if (leavesUnsubscribe) {
        leavesUnsubscribe();
    }
    
    leavesUnsubscribe = db.collection('leaveRequests')
        .where('teacherId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    refreshLeaveData();
                }
            });
        }, (error) => {
            console.error('Leaves listener error:', error);
        });
}

// Refresh all leave data
async function refreshLeaveData() {
    await Promise.all([
        updateRecentLeaves(),
        updateLeaveHistory(),
        updateTeacherData()
    ]);
}

// Update teacher data from Firestore
async function updateTeacherData() {
    const user = getCurrentUser();
    try {
        const teacherDoc = await db.collection('users').doc(user.uid).get();
        if (teacherDoc.exists) {
            currentTeacher = {
                id: teacherDoc.id,
                ...teacherDoc.data()
            };
            updateStats();
        }
    } catch (error) {
        console.error('Error updating teacher data:', error);
    }
}

// Update statistics
function updateStats() {
    if (currentTeacher) {
        document.getElementById('totalLeaves').textContent = currentTeacher.totalLeaves || 14;
        document.getElementById('remainingLeaves').textContent = currentTeacher.remainingLeaves || 14;
        document.getElementById('coverAssignments').textContent = currentTeacher.coverAssignmentsCount || 0;
    }
}

// Update recent leaves table
async function updateRecentLeaves() {
    const user = getCurrentUser();
    const tbody = document.getElementById('recentLeavesBody');
    
    try {
        const snapshot = await db.collection('leaveRequests')
            .where('teacherId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No leave requests found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const leave = doc.data();
            html += `
                <tr>
                    <td>${leave.leaveType || 'N/A'}</td>
                    <td>${formatDate(leave.startDate)}</td>
                    <td>${formatDate(leave.endDate)}</td>
                    <td><span class="status-${leave.status}">${leave.status}</span></td>
                    <td>${leave.substituteTeacherId ? 'Assigned' : 'Not assigned'}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Error updating recent leaves:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading data</td></tr>';
    }
}

// Update leave history table
async function updateLeaveHistory() {
    const user = getCurrentUser();
    const tbody = document.getElementById('leaveHistoryBody');
    const filter = document.getElementById('statusFilter')?.value || 'all';
    
    try {
        let query = db.collection('leaveRequests')
            .where('teacherId', '==', user.uid)
            .orderBy('createdAt', 'desc');
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No leave requests found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const leave = doc.data();
            
            // Apply filter
            if (filter !== 'all' && leave.status !== filter) {
                return;
            }
            
            html += `
                <tr>
                    <td>${leave.leaveType || 'N/A'}</td>
                    <td>${formatDate(leave.startDate)}</td>
                    <td>${formatDate(leave.endDate)}</td>
                    <td>${leave.reason || 'N/A'}</td>
                    <td><span class="status-${leave.status}">${leave.status}</span></td>
                    <td>${leave.substituteTeacherId || 'Not assigned'}</td>
                    <td>${formatDate(leave.createdAt)}</td>
                </tr>
            `;
        });
        
        if (html === '') {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matching records found</td></tr>';
        } else {
            tbody.innerHTML = html;
        }
    } catch (error) {
        console.error('Error updating leave history:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading data</td></tr>';
    }
}

// Filter leaves
function filterLeaves() {
    updateLeaveHistory();
}

// Initialize leave application form
function initializeLeaveForm() {
    const form = document.getElementById('leaveForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const user = getCurrentUser();
            const errorElement = document.getElementById('formError');
            const successElement = document.getElementById('formSuccess');
            
            // Hide previous messages
            errorElement.style.display = 'none';
            successElement.style.display = 'none';
            
            // Get form data
            const leaveData = {
                teacherId: user.uid,
                teacherName: user.name,
                leaveType: document.getElementById('leaveType').value,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                reason: document.getElementById('reason').value,
                assignmentLink: document.getElementById('assignmentLink').value || '',
                substituteTeacherId: null,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            // Validate dates
            const start = new Date(leaveData.startDate);
            const end = new Date(leaveData.endDate);
            
            if (end < start) {
                errorElement.textContent = 'End date cannot be before start date';
                errorElement.style.display = 'block';
                return;
            }
            
            // Calculate leave days
            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            
            if (days > currentTeacher.remainingLeaves) {
                errorElement.textContent = `Insufficient leaves. You have ${currentTeacher.remainingLeaves} days remaining.`;
                errorElement.style.display = 'block';
                return;
            }
            
            try {
                // Submit leave request
                await db.collection('leaveRequests').add(leaveData);
                
                // Show success message
                successElement.textContent = 'Leave request submitted successfully!';
                successElement.style.display = 'block';
                
                // Reset form
                form.reset();
                
                // Clear success message after 3 seconds
                setTimeout(() => {
                    successElement.style.display = 'none';
                }, 3000);
                
            } catch (error) {
                console.error('Error submitting leave:', error);
                errorElement.textContent = 'Error submitting leave request. Please try again.';
                errorElement.style.display = 'block';
            }
        });
    }
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
    if (sectionId === 'leave-history') {
        updateLeaveHistory();
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

// Clean up listener on page unload
window.addEventListener('beforeunload', () => {
    if (leavesUnsubscribe) {
        leavesUnsubscribe();
    }
});