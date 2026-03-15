// ==================== ADMIN.JS - Clean Version ====================
// This file handles all admin functionality EXCEPT email (now in mail.js)

let teachersUnsubscribe = null;
let leavesUnsubscribe = null;
let allTeachers = [];

// ==================== INITIALIZATION ====================
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
    
    // Initial data load
    await refreshAllData();
});

// ==================== FIREBASE LISTENERS ====================
function setupTeachersListener() {
    if (teachersUnsubscribe) teachersUnsubscribe();
    
    teachersUnsubscribe = db.collection('users')
        .where('role', '==', 'teacher')
        .onSnapshot((snapshot) => {
            refreshTeachersData();
        }, (error) => {
            console.error('Teachers listener error:', error);
            showNotification('Error loading teachers data', 'error');
        });
}

function setupLeavesListener() {
    if (leavesUnsubscribe) leavesUnsubscribe();
    
    leavesUnsubscribe = db.collection('leaveRequests')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            refreshAllData();
        }, (error) => {
            console.error('Leaves listener error:', error);
            showNotification('Error loading leave requests', 'error');
        });
}

// ==================== DATA REFRESH FUNCTIONS ====================
async function refreshAllData() {
    try {
        await Promise.all([
            updateDashboardStats(),
            updateRecentLeaves(),
            updateLeaveRequests(),
            updateTeachersTable()
        ]);
    } catch (error) {
        console.error('Error refreshing data:', error);
    }
}

async function refreshTeachersData() {
    try {
        await updateTeachersTable();
        await updateDashboardStats();
        await updateLeaveRequests();
    } catch (error) {
        console.error('Error refreshing teachers data:', error);
    }
}

// ==================== DASHBOARD FUNCTIONS ====================
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
            .where('approvedAt', '>=', today)
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

// ==================== LEAVE REQUESTS MANAGEMENT ====================
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
        const snapshot = await db.collection('leaveRequests')
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No leave requests found</td></tr>';
            return;
        }
        
        let html = '';
        for (const doc of snapshot.docs) {
            const leave = { id: doc.id, ...doc.data() };
            
            // Apply filter
            if (filter !== 'all' && leave.status !== filter) continue;
            
            // Get available teachers (excluding current teacher)
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
                        ${getSubstituteCell(leave, availableTeachers)}
                    </td>
                    <td>
                        ${getActionButtons(leave, doc.id)}
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

function getSubstituteCell(leave, availableTeachers) {
    if (leave.status === 'approved' && leave.substituteTeacherId) {
        return getTeacherName(leave.substituteTeacherId);
    } else if (leave.status === 'pending') {
        return `
            <select class="teacher-select" id="substitute-${leave.id}">
                <option value="">Select Substitute</option>
                ${availableTeachers.map(t => 
                    `<option value="${t.id}" ${t.id === leave.substituteTeacherId ? 'selected' : ''}>
                        ${t.name}
                    </option>`
                ).join('')}
            </select>
        `;
    }
    return 'N/A';
}

function getActionButtons(leave, id) {
    if (leave.status === 'pending') {
        return `
            <div class="action-buttons">
                <button onclick="approveLeave('${id}')" class="btn btn-success btn-sm">Approve</button>
                <button onclick="rejectLeave('${id}')" class="btn btn-danger btn-sm">Reject</button>
            </div>
        `;
    }
    return leave.status;
}

// ==================== LEAVE APPROVAL/REJECTION ====================
window.approveLeave = async function(leaveId) {
    try {
        // Get the selected substitute teacher
        const selectElement = document.getElementById(`substitute-${leaveId}`);
        if (!selectElement) {
            showNotification('Substitute selection not found', 'error');
            return;
        }
        
        const substituteTeacherId = selectElement.value;
        if (!substituteTeacherId) {
            showNotification('Please select a substitute teacher', 'warning');
            return;
        }
        
        // Get leave request data
        const leaveDoc = await db.collection('leaveRequests').doc(leaveId).get();
        if (!leaveDoc.exists) {
            showNotification('Leave request not found', 'error');
            return;
        }
        const leaveData = leaveDoc.data();
        
        // Get teacher data
        const teacherDoc = await db.collection('users').doc(leaveData.teacherId).get();
        if (!teacherDoc.exists) {
            showNotification('Teacher not found', 'error');
            return;
        }
        const teacherData = teacherDoc.data();
        
        // Get substitute data
        const substituteDoc = await db.collection('users').doc(substituteTeacherId).get();
        if (!substituteDoc.exists) {
            showNotification('Substitute teacher not found', 'error');
            return;
        }
        const substituteData = substituteDoc.data();
        
        // Calculate leave days
        const start = new Date(leaveData.startDate);
        const end = new Date(leaveData.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Start a batch write
        const batch = db.batch();
        
        // Update leave request
        batch.update(db.collection('leaveRequests').doc(leaveId), {
            status: 'approved',
            substituteTeacherId: substituteTeacherId,
            approvedAt: new Date().toISOString()
        });
        
        // Update teacher's remaining leaves
        batch.update(db.collection('users').doc(leaveData.teacherId), {
            remainingLeaves: firebase.firestore.FieldValue.increment(-days)
        });
        
        // Update substitute teacher's cover count
        batch.update(db.collection('users').doc(substituteTeacherId), {
            coverAssignmentsCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Commit the batch
        await batch.commit();
        
        showNotification('Leave approved successfully! Sending emails...', 'success');
        
        // Send emails using mail.js functions
        try {
            await sendLeaveApprovalEmail(
                teacherData.email,
                teacherData.name,
                leaveData.leaveType,
                leaveData.startDate,
                leaveData.endDate,
                substituteData.name
            );
        } catch (emailError) {
            console.error('Error sending approval email:', emailError);
        }
        
        try {
            await sendSubstituteAssignmentEmail(
                substituteData.email,
                substituteData.name,
                teacherData.name,
                leaveData.leaveType,
                leaveData.startDate,
                leaveData.endDate,
                leaveData.assignmentLink
            );
        } catch (emailError) {
            console.error('Error sending substitute email:', emailError);
        }
        
    } catch (error) {
        console.error('Error approving leave:', error);
        showNotification('Error approving leave: ' + error.message, 'error');
    }
};

window.rejectLeave = async function(leaveId) {
    if (!confirm('Are you sure you want to reject this leave request?')) {
        return;
    }
    
    try {
        // Get leave request data
        const leaveDoc = await db.collection('leaveRequests').doc(leaveId).get();
        if (!leaveDoc.exists) {
            showNotification('Leave request not found', 'error');
            return;
        }
        const leaveData = leaveDoc.data();
        
        // Get teacher data
        const teacherDoc = await db.collection('users').doc(leaveData.teacherId).get();
        if (!teacherDoc.exists) {
            showNotification('Teacher not found', 'error');
            return;
        }
        const teacherData = teacherDoc.data();
        
        // Update leave request
        await db.collection('leaveRequests').doc(leaveId).update({
            status: 'rejected',
            rejectedAt: new Date().toISOString()
        });
        
        showNotification('Leave rejected successfully! Sending email...', 'success');
        
        // Send rejection email using mail.js
        try {
            await sendLeaveRejectionEmail(
                teacherData.email,
                teacherData.name,
                leaveData.leaveType,
                leaveData.startDate,
                leaveData.endDate
            );
        } catch (emailError) {
            console.error('Error sending rejection email:', emailError);
        }
        
    } catch (error) {
        console.error('Error rejecting leave:', error);
        showNotification('Error rejecting leave: ' + error.message, 'error');
    }
};

// ==================== TEACHERS TABLE ====================
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

// ==================== CREATE TEACHER ACCOUNT ====================
function initializeCreateTeacherForm() {
    const form = document.getElementById('createTeacherForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('teacherName').value;
            const email = document.getElementById('teacherEmail').value;
            const password = document.getElementById('teacherPassword').value;
            const errorElement = document.getElementById('createError');
            const successElement = document.getElementById('createSuccess');
            
            errorElement.style.display = 'none';
            successElement.style.display = 'none';
            
            try {
                // Create user in Firebase Auth
                const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
                
                // Create user document in Firestore
                await db.collection('users').doc(userCredential.user.uid).set({
                    name: name,
                    email: email,
                    role: 'teacher',
                    totalLeaves: 14,
                    remainingLeaves: 14,
                    coverAssignmentsCount: 0,
                    createdAt: new Date().toISOString()
                });
                
                successElement.textContent = 'Teacher account created successfully!';
                successElement.style.display = 'block';
                form.reset();
                
            } catch (error) {
                console.error('Error creating teacher:', error);
                errorElement.textContent = error.message;
                errorElement.style.display = 'block';
            }
        });
    }
}

// ==================== UTILITY FUNCTIONS ====================
function filterLeaveRequests() {
    updateLeaveRequests();
}

function getTeacherName(teacherId) {
    const teacher = allTeachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : teacherId;
}

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

function showNotification(message, type) {
    // Remove old notification
    const oldNotif = document.getElementById('adminNotification');
    if (oldNotif) oldNotif.remove();
    
    // Create notification
    const notif = document.createElement('div');
    notif.id = 'adminNotification';
    notif.style.position = 'fixed';
    notif.style.top = '20px';
    notif.style.right = '20px';
    notif.style.padding = '15px 25px';
    notif.style.borderRadius = '8px';
    notif.style.zIndex = '10000';
    notif.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    notif.style.fontWeight = 'bold';
    notif.style.animation = 'slideIn 0.3s ease-out';
    
    const colors = {
        success: { bg: '#27ae60', color: 'white' },
        error: { bg: '#e74c3c', color: 'white' },
        warning: { bg: '#f39c12', color: 'white' },
        info: { bg: '#3498db', color: 'white' }
    };
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notif.style.background = colors[type]?.bg || '#333';
    notif.style.color = colors[type]?.color || 'white';
    notif.innerHTML = `${icons[type] || '•'} ${message}`;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

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

window.showSection = function(sectionId) {
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
};

// ==================== PDF REPORT FUNCTIONS ====================
window.downloadCurrentViewPDF = async function() {
    try {
        const statusFilter = document.getElementById('statusFilter').value;
        const snapshot = await db.collection('leaveRequests')
            .orderBy('createdAt', 'desc')
            .get();
        
        const leaves = [];
        snapshot.forEach(doc => {
            const leave = { id: doc.id, ...doc.data() };
            if (statusFilter === 'all' || leave.status === statusFilter) {
                leaves.push(leave);
            }
        });
        
        generatePDFReport(leaves, `Leave_Requests_${statusFilter}_${new Date().toISOString().split('T')[0]}`);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        showNotification('Error generating PDF', 'error');
    }
};

window.generateMonthlyReport = async function() {
    const monthInput = document.getElementById('reportMonth').value;
    if (!monthInput) {
        showNotification('Please select a month', 'error');
        return;
    }
    
    const [year, month] = monthInput.split('-');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    try {
        showNotification('Generating report...', 'info');
        
        const snapshot = await db.collection('leaveRequests')
            .where('createdAt', '>=', startDate.toISOString())
            .where('createdAt', '<=', endDate.toISOString())
            .orderBy('createdAt', 'desc')
            .get();
        
        const leaves = [];
        snapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        
        if (leaves.length === 0) {
            showNotification('No leave requests found for the selected month', 'info');
            return;
        }
        
        generateMonthlyPDFReport(leaves, year, month);
        showNotification('Report generated successfully!', 'success');
        
    } catch (error) {
        console.error('Error generating monthly report:', error);
        showNotification('Error generating report', 'error');
    }
};

// PDF Generation Functions
function generatePDFReport(leaves, filename, title = 'Leave Requests Report') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text(title, 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    
    const tableColumn = ['Teacher', 'Type', 'Start Date', 'End Date', 'Status', 'Substitute'];
    const tableRows = [];
    
    leaves.forEach(leave => {
        tableRows.push([
            leave.teacherName || 'Unknown',
            leave.leaveType || 'N/A',
            formatDate(leave.startDate),
            formatDate(leave.endDate),
            leave.status || 'N/A',
            getTeacherName(leave.substituteTeacherId) || 'Not assigned'
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    doc.save(`${filename}.pdf`);
}

function generateMonthlyPDFReport(leaves, year, month) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    doc.setFontSize(24);
    doc.text(`Monthly Leave Report`, 14, 22);
    doc.setFontSize(16);
    doc.text(`${monthNames[parseInt(month) - 1]} ${year}`, 14, 32);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);
    
    const tableColumn = ['Teacher', 'Type', 'Period', 'Status'];
    const tableRows = [];
    
    leaves.forEach(leave => {
        tableRows.push([
            leave.teacherName || 'Unknown',
            leave.leaveType || 'N/A',
            `${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`,
            leave.status || 'N/A'
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    doc.save(`Monthly_Report_${monthNames[parseInt(month) - 1]}_${year}.pdf`);
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', () => {
    if (teachersUnsubscribe) teachersUnsubscribe();
    if (leavesUnsubscribe) leavesUnsubscribe();
});

// ==================== EXPOSE GLOBAL FUNCTIONS ====================
window.logout = logout;
window.filterLeaveRequests = filterLeaveRequests;
window.showSection = showSection;
window.downloadCurrentViewPDF = downloadCurrentViewPDF;
window.generateMonthlyReport = generateMonthlyReport;
window.generateYearlySummary = generateYearlySummary;
window.downloadPendingReport = downloadPendingReport;
window.downloadTeacherReport = downloadTeacherReport;
window.downloadSubstituteReport = downloadSubstituteReport;

console.log('✅ Admin.js loaded successfully');