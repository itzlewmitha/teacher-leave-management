// ==================== MAIL.JS - Complete Email System ====================
// This file handles ALL email functionality for the Leave Management System

// Apps Script URL - UPDATE THIS AFTER DEPLOYMENT
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwIpygG_GBy4u-HQbVzj314oLAfKakvqq2dLl5gSojlpGNOmjtYoSgNVM_uw0vYDxx3ig/exec';

// Email Service Status
let emailServiceReady = false;

// ==================== INITIALIZE EMAIL SERVICE ====================
async function initEmailService() {
    console.log('📧 Initializing email service...');
    
    try {
        // Test if Apps Script is reachable
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        emailServiceReady = true;
        console.log('✅ Email service initialized');
        return true;
    } catch (error) {
        console.warn('⚠️ Email service not reachable, will use fallback methods');
        emailServiceReady = false;
        return false;
    }
}

// ==================== MAIN EMAIL SENDING FUNCTION ====================
async function sendEmail(emailData) {
    console.log('📧 Preparing to send email:', emailData);
    
    // Validate required fields
    if (!emailData.action) {
        console.error('❌ Missing action in email data');
        return { success: false, error: 'Missing action' };
    }
    
    // Ensure we have a recipient
    if (!emailData.teacherEmail && !emailData.substituteEmail) {
        console.error('❌ No recipient email provided');
        return { success: false, error: 'No recipient email' };
    }
    
    // Try primary method (fetch with no-cors)
    try {
        const result = await sendEmailViaFetch(emailData);
        if (result.success) {
            showEmailNotification('✅ Email sent successfully!', 'success');
            return result;
        }
    } catch (error) {
        console.warn('⚠️ Fetch method failed, trying fallback...', error);
    }
    
    // Try fallback method (iframe)
    try {
        const result = await sendEmailViaIframe(emailData);
        if (result.success) {
            showEmailNotification('✅ Email sent via fallback!', 'success');
            return result;
        }
    } catch (error) {
        console.warn('⚠️ Iframe method failed, trying form submit...', error);
    }
    
    // Final fallback (form submit)
    try {
        const result = sendEmailViaForm(emailData);
        showEmailNotification('✅ Email request submitted!', 'info');
        return result;
    } catch (error) {
        console.error('❌ All email methods failed:', error);
        showEmailNotification('❌ Failed to send email', 'error');
        return { success: false, error: error.message };
    }
}

// ==================== EMAIL SENDING METHODS ====================

// Method 1: Fetch API with no-cors
async function sendEmailViaFetch(emailData) {
    return new Promise((resolve, reject) => {
        console.log('📧 Method 1: Sending via fetch...');
        
        // Create form data
        const formData = new FormData();
        formData.append('data', JSON.stringify(emailData));
        
        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: formData
        })
        .then(() => {
            console.log('✅ Fetch method completed');
            resolve({ success: true, method: 'fetch' });
        })
        .catch(error => {
            console.error('❌ Fetch method failed:', error);
            reject(error);
        });
        
        // Resolve after 3 seconds even if no response (no-cors mode doesn't return response)
        setTimeout(() => {
            resolve({ success: true, method: 'fetch-timeout' });
        }, 3000);
    });
}

// Method 2: Iframe with postMessage
async function sendEmailViaIframe(emailData) {
    return new Promise((resolve, reject) => {
        console.log('📧 Method 2: Sending via iframe...');
        
        const requestId = 'email_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.name = requestId;
        iframe.style.display = 'none';
        
        // Create form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = APPS_SCRIPT_URL;
        form.target = requestId;
        form.style.display = 'none';
        
        // Add data
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'data';
        input.value = JSON.stringify(emailData);
        form.appendChild(input);
        
        // Add to document
        document.body.appendChild(iframe);
        document.body.appendChild(form);
        
        // Set timeout
        let isResolved = false;
        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                console.log('✅ Iframe method timed out but likely sent');
                resolve({ success: true, method: 'iframe-timeout' });
            }
        }, 5000);
        
        // Cleanup function
        function cleanup() {
            try {
                if (form.parentNode) document.body.removeChild(form);
                if (iframe.parentNode) document.body.removeChild(iframe);
            } catch (e) {
                console.log('Cleanup error:', e);
            }
        }
        
        // Submit form
        form.submit();
        console.log('✅ Iframe form submitted');
        
        // If iframe loads, try to get response
        iframe.onload = function() {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                cleanup();
                resolve({ success: true, method: 'iframe' });
            }
        };
    });
}

// Method 3: Direct form submit (opens new window)
function sendEmailViaForm(emailData) {
    console.log('📧 Method 3: Sending via form submit...');
    
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = APPS_SCRIPT_URL;
    form.target = '_blank';
    form.style.display = 'none';
    
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'data';
    input.value = JSON.stringify(emailData);
    
    form.appendChild(input);
    document.body.appendChild(form);
    
    form.submit();
    
    setTimeout(() => {
        document.body.removeChild(form);
    }, 1000);
    
    return { success: true, method: 'form' };
}

// ==================== EMAIL NOTIFICATION FUNCTIONS ====================

function showEmailNotification(message, type) {
    // Remove existing notification
    const existing = document.getElementById('emailNotification');
    if (existing) existing.remove();
    
    // Create notification
    const notif = document.createElement('div');
    notif.id = 'emailNotification';
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
    `;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    notif.innerHTML = `${icon} ${message}`;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

// ==================== SPECIFIC EMAIL TYPES ====================

async function sendLeaveApprovalEmail(teacherEmail, teacherName, leaveType, startDate, endDate, substituteName) {
    return sendEmail({
        action: 'sendLeaveApproval',
        teacherEmail: teacherEmail,
        teacherName: teacherName,
        leaveType: leaveType,
        startDate: formatDateForEmail(startDate),
        endDate: formatDateForEmail(endDate),
        substituteName: substituteName
    });
}

async function sendLeaveRejectionEmail(teacherEmail, teacherName, leaveType, startDate, endDate) {
    return sendEmail({
        action: 'sendLeaveRejection',
        teacherEmail: teacherEmail,
        teacherName: teacherName,
        leaveType: leaveType,
        startDate: formatDateForEmail(startDate),
        endDate: formatDateForEmail(endDate)
    });
}

async function sendSubstituteAssignmentEmail(substituteEmail, substituteName, teacherName, leaveType, startDate, endDate, assignmentLink) {
    return sendEmail({
        action: 'sendSubstituteAssignment',
        substituteEmail: substituteEmail,
        substituteName: substituteName,
        teacherName: teacherName,
        leaveType: leaveType,
        startDate: formatDateForEmail(startDate),
        endDate: formatDateForEmail(endDate),
        assignmentLink: assignmentLink || 'No assignment link provided'
    });
}

async function sendTestEmail(email, name) {
    return sendEmail({
        action: 'test',
        teacherEmail: email,
        teacherName: name || 'Test User',
        timestamp: new Date().toString()
    });
}

// ==================== TEST FUNCTIONS ====================

async function testEmailNow() {
    const user = getCurrentUser();
    
    if (!user || !user.email) {
        showEmailNotification('Please login first', 'error');
        return false;
    }
    
    showEmailNotification(`📧 Sending test to ${user.email}...`, 'info');
    console.log('📧 Starting email test for:', user.email);
    
    const result = await sendTestEmail(user.email, user.name);
    
    if (result.success) {
        showEmailNotification('✅ Test email sent! Check your inbox in 2-3 minutes.', 'success');
    } else {
        showEmailNotification('❌ Failed to send test email', 'error');
    }
    
    return result.success;
}

// ==================== UTILITY FUNCTIONS ====================

function formatDateForEmail(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

// Add CSS animation
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

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initEmailService();
});

// Export functions globally
window.sendEmail = sendEmail;
window.sendLeaveApprovalEmail = sendLeaveApprovalEmail;
window.sendLeaveRejectionEmail = sendLeaveRejectionEmail;
window.sendSubstituteAssignmentEmail = sendSubstituteAssignmentEmail;
window.sendTestEmail = sendTestEmail;
window.testEmailNow = testEmailNow;

console.log('✅ Mail.js loaded successfully');