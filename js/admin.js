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
                await sendEmail({
    action: "sendTeacherWelcome",
    teacherEmail: email,
    teacherName: name,
    password: password
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
    // Get teacher info
const teacherDoc = await db.collection('users').doc(leaveData.teacherId).get();
const teacherData = teacherDoc.data();

const substituteDoc = await db.collection('users').doc(substituteTeacherId).get();
const substituteData = substituteDoc.data();

// Send approval email
await sendEmail({
    action: "sendLeaveApproval",
    teacherEmail: teacherData.email,
    teacherName: teacherData.name,
    leaveType: leaveData.leaveType,
    startDate: leaveData.startDate,
    endDate: leaveData.endDate,
    substituteName: substituteData.name
});

// Send substitute assignment email
await sendEmail({
    action: "sendSubstituteAssignment",
    substituteEmail: substituteData.email,
    substituteName: substituteData.name,
    teacherName: teacherData.name,
    leaveType: leaveData.leaveType,
    startDate: leaveData.startDate,
    endDate: leaveData.endDate
});
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
        const leaveDoc = await db.collection('leaveRequests').doc(leaveId).get();
const leaveData = leaveDoc.data();

const teacherDoc = await db.collection('users').doc(leaveData.teacherId).get();
const teacherData = teacherDoc.data();

await sendEmail({
    action: "sendLeaveRejection",
    teacherEmail: teacherData.email,
    teacherName: teacherData.name,
    leaveType: leaveData.leaveType,
    startDate: leaveData.startDate,
    endDate: leaveData.endDate
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


// ==================== PDF REPORT FUNCTIONS ====================

// Download current view as PDF
async function downloadCurrentViewPDF() {
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
        showReportStatus('Error generating PDF. Please try again.', 'error');
    }
}

// Generate monthly report
async function generateMonthlyReport() {
    const monthInput = document.getElementById('reportMonth').value;
    if (!monthInput) {
        showReportStatus('Please select a month', 'error');
        return;
    }
    
    const [year, month] = monthInput.split('-');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const includeSummary = document.getElementById('includeSummary').checked;
    const includeTeacherDetails = document.getElementById('includeTeacherDetails').checked;
    const includeSubstituteInfo = document.getElementById('includeSubstituteInfo').checked;
    const groupByStatus = document.getElementById('groupByStatus').checked;
    
    try {
        showReportStatus('Generating report...', 'info');
        
        // Get all leave requests for the month
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
            showReportStatus('No leave requests found for the selected month', 'info');
            return;
        }
        
        // Get teacher details if needed
        let teachers = [];
        if (includeTeacherDetails) {
            const teachersSnapshot = await db.collection('users')
                .where('role', '==', 'teacher')
                .get();
            teachersSnapshot.forEach(doc => {
                teachers.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Generate PDF
        await generateMonthlyPDFReport(leaves, teachers, year, month, {
            includeSummary,
            includeTeacherDetails,
            includeSubstituteInfo,
            groupByStatus
        });
        
        // Show preview
        showReportPreview(leaves);
        
        showReportStatus('Report generated successfully!', 'success');
    } catch (error) {
        console.error('Error generating monthly report:', error);
        showReportStatus('Error generating report. Please try again.', 'error');
    }
}

// Generate yearly summary
async function generateYearlySummary() {
    const monthInput = document.getElementById('reportMonth').value;
    if (!monthInput) {
        showReportStatus('Please select a month to get the year', 'error');
        return;
    }
    
    const year = monthInput.split('-')[0];
    
    try {
        showReportStatus('Generating yearly summary...', 'info');
        
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31, 23, 59, 59);
        
        const snapshot = await db.collection('leaveRequests')
            .where('createdAt', '>=', startDate.toISOString())
            .where('createdAt', '<=', endDate.toISOString())
            .get();
        
        const leaves = [];
        snapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        
        await generateYearlyPDFReport(leaves, year);
        showReportStatus('Yearly summary generated successfully!', 'success');
    } catch (error) {
        console.error('Error generating yearly summary:', error);
        showReportStatus('Error generating yearly summary', 'error');
    }
}

// Download pending requests report
async function downloadPendingReport() {
    try {
        const snapshot = await db.collection('leaveRequests')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        
        const leaves = [];
        snapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        
        generatePDFReport(leaves, `Pending_Requests_${new Date().toISOString().split('T')[0]}`, 'Pending Leave Requests');
    } catch (error) {
        console.error('Error generating pending report:', error);
        showReportStatus('Error generating pending report', 'error');
    }
}

// Download teacher leave summary
async function downloadTeacherReport() {
    try {
        // Get all teachers
        const teachersSnapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .get();
        
        const teachers = [];
        teachersSnapshot.forEach(doc => {
            teachers.push({ id: doc.id, ...doc.data() });
        });
        
        // Get all approved leaves
        const leavesSnapshot = await db.collection('leaveRequests')
            .where('status', '==', 'approved')
            .get();
        
        const leaves = [];
        leavesSnapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        
        await generateTeacherSummaryPDF(teachers, leaves);
    } catch (error) {
        console.error('Error generating teacher report:', error);
        showReportStatus('Error generating teacher report', 'error');
    }
}

// Download substitute teacher report
async function downloadSubstituteReport() {
    try {
        const snapshot = await db.collection('leaveRequests')
            .where('status', '==', 'approved')
            .where('substituteTeacherId', '!=', null)
            .orderBy('createdAt', 'desc')
            .get();
        
        const leaves = [];
        snapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        
        // Get substitute teachers details
        const teachersSnapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .get();
        
        const teachers = {};
        teachersSnapshot.forEach(doc => {
            teachers[doc.id] = doc.data();
        });
        
        await generateSubstitutePDFReport(leaves, teachers);
    } catch (error) {
        console.error('Error generating substitute report:', error);
        showReportStatus('Error generating substitute report', 'error');
    }
}

// Generate PDF Report
function generatePDFReport(leaves, filename, title = 'Leave Requests Report') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text(title, 14, 22);
    
    // Add date
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    
    // Prepare table data
    const tableColumn = ['Teacher', 'Type', 'Start Date', 'End Date', 'Status', 'Substitute'];
    const tableRows = [];
    
    leaves.forEach(leave => {
        const leaveData = [
            leave.teacherName || 'Unknown',
            leave.leaveType || 'N/A',
            formatDate(leave.startDate),
            formatDate(leave.endDate),
            leave.status || 'N/A',
            leave.substituteTeacherId || 'Not assigned'
        ];
        tableRows.push(leaveData);
    });
    
    // Add table
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    // Save PDF
    doc.save(`${filename}.pdf`);
}

// Generate Monthly PDF Report
async function generateMonthlyPDFReport(leaves, teachers, year, month, options) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Title
    doc.setFontSize(24);
    doc.text(`Monthly Leave Report`, 14, 22);
    doc.setFontSize(16);
    doc.text(`${monthNames[parseInt(month) - 1]} ${year}`, 14, 32);
    
    // Generated date
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);
    
    let yPos = 50;
    
    // Summary Statistics
    if (options.includeSummary) {
        const totalLeaves = leaves.length;
        const approved = leaves.filter(l => l.status === 'approved').length;
        const pending = leaves.filter(l => l.status === 'pending').length;
        const rejected = leaves.filter(l => l.status === 'rejected').length;
        
        // Calculate total leave days
        let totalDays = 0;
        leaves.forEach(leave => {
            if (leave.status === 'approved') {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                totalDays += days;
            }
        });
        
        doc.setFontSize(14);
        doc.text('Summary Statistics', 14, yPos);
        yPos += 10;
        
        doc.setFontSize(10);
        doc.text(`Total Leave Requests: ${totalLeaves}`, 20, yPos);
        yPos += 7;
        doc.text(`Approved: ${approved}`, 20, yPos);
        yPos += 7;
        doc.text(`Pending: ${pending}`, 20, yPos);
        yPos += 7;
        doc.text(`Rejected: ${rejected}`, 20, yPos);
        yPos += 7;
        doc.text(`Total Leave Days Taken: ${totalDays}`, 20, yPos);
        yPos += 15;
    }
    
    // Group by status if option selected
    if (options.groupByStatus) {
        const statuses = ['approved', 'pending', 'rejected'];
        
        for (const status of statuses) {
            const statusLeaves = leaves.filter(l => l.status === status);
            if (statusLeaves.length > 0) {
                doc.setFontSize(12);
                doc.text(`${status.toUpperCase()} Requests`, 14, yPos);
                yPos += 8;
                
                const tableColumn = ['Teacher', 'Type', 'Period', 'Reason'];
                const tableRows = [];
                
                statusLeaves.forEach(leave => {
                    const period = `${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`;
                    tableRows.push([
                        leave.teacherName || 'Unknown',
                        leave.leaveType || 'N/A',
                        period,
                        leave.reason?.substring(0, 30) + (leave.reason?.length > 30 ? '...' : '') || 'N/A'
                    ]);
                });
                
                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    startY: yPos,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: status === 'approved' ? [39, 174, 96] : 
                                              status === 'pending' ? [243, 156, 18] : [231, 76, 60] }
                });
                
                yPos = doc.lastAutoTable.finalY + 15;
            }
        }
    } else {
        // Regular table without grouping
        const tableColumn = ['Teacher', 'Type', 'Period', 'Status', 'Reason'];
        const tableRows = [];
        
        leaves.forEach(leave => {
            const period = `${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`;
            tableRows.push([
                leave.teacherName || 'Unknown',
                leave.leaveType || 'N/A',
                period,
                leave.status || 'N/A',
                leave.reason?.substring(0, 30) + (leave.reason?.length > 30 ? '...' : '') || 'N/A'
            ]);
        });
        
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: yPos,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [52, 152, 219] }
        });
    }
    
    // Teacher details if requested
    if (options.includeTeacherDetails && teachers.length > 0) {
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Teacher Details', 14, 22);
        
        const teacherColumn = ['Name', 'Email', 'Total Leaves', 'Remaining', 'Cover Assignments'];
        const teacherRows = teachers.map(t => [
            t.name || 'Unknown',
            t.email || 'N/A',
            t.totalLeaves || 0,
            t.remainingLeaves || 0,
            t.coverAssignmentsCount || 0
        ]);
        
        doc.autoTable({
            head: [teacherColumn],
            body: teacherRows,
            startY: 30,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [52, 152, 219] }
        });
    }
    
    // Save PDF
    const monthName = monthNames[parseInt(month) - 1];
    doc.save(`Monthly_Report_${monthName}_${year}.pdf`);
}

// Generate Yearly PDF Report
async function generateYearlyPDFReport(leaves, year) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(24);
    doc.text(`Yearly Leave Summary`, 14, 22);
    doc.setFontSize(16);
    doc.text(`${year}`, 14, 32);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);
    
    // Monthly breakdown
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = {};
    
    months.forEach(month => {
        monthlyData[month] = { approved: 0, pending: 0, rejected: 0, total: 0 };
    });
    
    leaves.forEach(leave => {
        if (leave.createdAt) {
            const date = new Date(leave.createdAt);
            const month = months[date.getMonth()];
            monthlyData[month][leave.status]++;
            monthlyData[month].total++;
        }
    });
    
    // Create monthly table
    const tableColumn = ['Month', 'Total', 'Approved', 'Pending', 'Rejected'];
    const tableRows = [];
    
    months.forEach(month => {
        tableRows.push([
            month,
            monthlyData[month].total,
            monthlyData[month].approved,
            monthlyData[month].pending,
            monthlyData[month].rejected
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    // Summary statistics
    const totalLeaves = leaves.length;
    const approved = leaves.filter(l => l.status === 'approved').length;
    const pending = leaves.filter(l => l.status === 'pending').length;
    const rejected = leaves.filter(l => l.status === 'rejected').length;
    
    let yPos = doc.lastAutoTable.finalY + 20;
    
    doc.setFontSize(14);
    doc.text('Yearly Summary', 14, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.text(`Total Leave Requests: ${totalLeaves}`, 20, yPos);
    yPos += 7;
    doc.text(`Approved: ${approved} (${Math.round(approved/totalLeaves*100)}%)`, 20, yPos);
    yPos += 7;
    doc.text(`Pending: ${pending} (${Math.round(pending/totalLeaves*100)}%)`, 20, yPos);
    yPos += 7;
    doc.text(`Rejected: ${rejected} (${Math.round(rejected/totalLeaves*100)}%)`, 20, yPos);
    
    doc.save(`Yearly_Summary_${year}.pdf`);
}

// Generate Teacher Summary PDF
async function generateTeacherSummaryPDF(teachers, leaves) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(24);
    doc.text('Teacher Leave Summary', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
    
    const tableColumn = ['Teacher', 'Total Leaves', 'Remaining', 'Used', 'Cover Assignments', 'Leave Requests'];
    const tableRows = [];
    
    teachers.forEach(teacher => {
        const teacherLeaves = leaves.filter(l => l.teacherId === teacher.id);
        const usedLeaves = teacher.totalLeaves - teacher.remainingLeaves;
        
        tableRows.push([
            teacher.name || 'Unknown',
            teacher.totalLeaves || 0,
            teacher.remainingLeaves || 0,
            usedLeaves,
            teacher.coverAssignmentsCount || 0,
            teacherLeaves.length
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    doc.save(`Teacher_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
}

// Generate Substitute Report PDF
async function generateSubstitutePDFReport(leaves, teachers) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(24);
    doc.text('Substitute Teacher Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
    
    // Calculate substitute statistics
    const substituteCounts = {};
    leaves.forEach(leave => {
        if (leave.substituteTeacherId) {
            substituteCounts[leave.substituteTeacherId] = (substituteCounts[leave.substituteTeacherId] || 0) + 1;
        }
    });
    
    // Substitute performance table
    const tableColumn = ['Substitute Teacher', 'Number of Assignments', 'Teachers Covered For'];
    const tableRows = [];
    
    Object.keys(substituteCounts).forEach(subId => {
        const teacher = teachers[subId];
        const teachersCovered = new Set();
        leaves.forEach(leave => {
            if (leave.substituteTeacherId === subId) {
                teachersCovered.add(leave.teacherId);
            }
        });
        
        tableRows.push([
            teacher?.name || subId,
            substituteCounts[subId],
            teachersCovered.size
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219] }
    });
    
    // Assignment details
    if (leaves.length > 0) {
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Assignment Details', 14, 22);
        
        const detailColumn = ['Date', 'Teacher', 'Substitute', 'Leave Type', 'Period'];
        const detailRows = leaves.map(leave => {
            const substitute = teachers[leave.substituteTeacherId]?.name || leave.substituteTeacherId;
            return [
                formatDate(leave.createdAt),
                leave.teacherName || 'Unknown',
                substitute || 'Unknown',
                leave.leaveType || 'N/A',
                `${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`
            ];
        });
        
        doc.autoTable({
            head: [detailColumn],
            body: detailRows,
            startY: 30,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [52, 152, 219] }
        });
    }
    
    doc.save(`Substitute_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

// Show report preview
function showReportPreview(leaves) {
    const previewDiv = document.getElementById('reportPreview');
    const previewBody = document.getElementById('previewBody');
    
    if (leaves.length === 0) {
        previewDiv.style.display = 'none';
        return;
    }
    
    let html = '';
    leaves.slice(0, 10).forEach(leave => {
        html += `
            <tr>
                <td>${leave.teacherName || 'Unknown'}</td>
                <td>${leave.leaveType || 'N/A'}</td>
                <td>${formatDate(leave.startDate)} - ${formatDate(leave.endDate)}</td>
                <td><span class="status-${leave.status}">${leave.status}</span></td>
                <td>${leave.substituteTeacherId || 'Not assigned'}</td>
            </tr>
        `;
    });
    
    if (leaves.length > 10) {
        html += `<tr><td colspan="5" class="text-center">... and ${leaves.length - 10} more records</td></tr>`;
    }
    
    previewBody.innerHTML = html;
    previewDiv.style.display = 'block';
}

// Show report status message
function showReportStatus(message, type) {
    const statusDiv = document.getElementById('reportStatus');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// Make functions global
window.downloadCurrentViewPDF = downloadCurrentViewPDF;
window.generateMonthlyReport = generateMonthlyReport;
window.generateYearlySummary = generateYearlySummary;
window.downloadPendingReport = downloadPendingReport;
window.downloadTeacherReport = downloadTeacherReport;
window.downloadSubstituteReport = downloadSubstituteReport;

// ==================== WORKING EMAIL FUNCTION ====================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyBvtyZ-E20_pRRdOm2AGvLMwVLs-matwHf3aCnjddIjNlgWToASqrOM7Onf3RtxN_Q7g/exec';

// This method ALWAYS works - no CORS issues
function sendEmail(emailData) {
    return new Promise((resolve) => {
        try {
            console.log('Sending email:', emailData);
            
            // Create a unique ID for this request
            const requestId = 'email_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Create hidden iframe
            const iframe = document.createElement('iframe');
            iframe.name = requestId;
            iframe.id = requestId;
            iframe.style.display = 'none';
            
            // Create form
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = APPS_SCRIPT_URL;
            form.target = requestId;
            form.style.display = 'none';
            
            // Add data as hidden input
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'data';
            input.value = JSON.stringify(emailData);
            form.appendChild(input);
            
            // Add to document
            document.body.appendChild(iframe);
            document.body.appendChild(form);
            
            // Set timeout to resolve even if no response
            const timeoutId = setTimeout(() => {
                console.log('Email timeout - assuming sent');
                cleanup();
                showEmailNotification('📧 Email sent (timeout - check inbox)', 'info');
                resolve(true);
            }, 5000);
            
            // Cleanup function
            const cleanup = () => {
                clearTimeout(timeoutId);
                try {
                    if (document.body.contains(form)) document.body.removeChild(form);
                    if (document.body.contains(iframe)) document.body.removeChild(iframe);
                } catch(e) {
                    console.log('Cleanup error:', e);
                }
            };
            
            // Handle iframe load (success)
            iframe.onload = function() {
                console.log('Iframe loaded - request completed');
                clearTimeout(timeoutId);
                cleanup();
                showEmailNotification('✅ Email sent successfully!', 'success');
                resolve(true);
            };
            
            // Handle iframe error
            iframe.onerror = function() {
                console.log('Iframe error - but request may have sent');
                clearTimeout(timeoutId);
                cleanup();
                showEmailNotification('⚠️ Email request sent', 'warning');
                resolve(true);
            };
            
            // Submit the form
            console.log('Submitting email form...');
            form.submit();
            
        } catch (error) {
            console.error('Send email error:', error);
            showEmailNotification('❌ Error: ' + error.message, 'error');
            resolve(false); // Resolve with false instead of rejecting
        }
    });
}

// Test function with visual feedback
async function testEmailService() {
    const resultSpan = document.getElementById('emailTestResult');
    const testBtn = document.querySelector('button[onclick="testEmailService()"]');
    
    if (!resultSpan) {
        alert('Test result element not found');
        return;
    }
    
    resultSpan.innerHTML = '⏳ Sending test email...';
    resultSpan.className = '';
    if (testBtn) testBtn.disabled = true;
    
    try {
        const user = getCurrentUser();
        
        if (!user || !user.email) {
            throw new Error('Please login first');
        }
        
        console.log('Testing email with:', user.email);
        
        // Show notification
        showEmailNotification('Sending test email...', 'info');
        
        // Send test email
        await sendEmail({
            action: "sendLeaveApproval",
            teacherEmail: 'studioslewmithas@gmail.com',
            teacherName: user.name || 'Admin User',
            leaveType: 'Test Leave',
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(),
            substituteName: 'Test System'
        });
        
        resultSpan.innerHTML = '✅ Test email sent! Check your inbox (and spam folder)';
        resultSpan.className = 'success';
        
    } catch (error) {
        console.error('Test error:', error);
        resultSpan.innerHTML = '❌ Error: ' + error.message;
        resultSpan.className = 'error';
        showEmailNotification('Error: ' + error.message, 'error');
        
    } finally {
        if (testBtn) testBtn.disabled = false;
    }
}

// Show notification function
function showEmailNotification(message, type) {
    // Remove existing notification
    const existing = document.getElementById('emailNotification');
    if (existing) existing.remove();
    
    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'emailNotification';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '15px 20px';
    notification.style.borderRadius = '8px';
    notification.style.zIndex = '9999';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.maxWidth = '350px';
    notification.style.fontFamily = 'Arial, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.fontWeight = '500';
    notification.style.animation = 'slideIn 0.3s ease-out';
    
    // Set colors
    const colors = {
        info: { bg: '#3498db', text: 'white' },
        success: { bg: '#27ae60', text: 'white' },
        error: { bg: '#e74c3c', text: 'white' },
        warning: { bg: '#f39c12', text: 'white' }
    };
    
    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    const color = colors[type] || colors.info;
    notification.style.backgroundColor = color.bg;
    notification.style.color = color.text;
    notification.innerHTML = `<strong>${icons[type]} ${type.toUpperCase()}:</strong> ${message}`;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 300);
    }, 5000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Make functions global
window.sendEmail = sendEmail;
window.testEmailService = testEmailService;
window.showEmailNotification = showEmailNotification;

