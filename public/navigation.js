// Shared State
export let activeUserId = localStorage.getItem('pulse_active_user_id') 
  ? parseInt(localStorage.getItem('pulse_active_user_id'), 10) 
  : null;

export async function fetchAPI(endpoint, options = {}) {
  const url = `${window.location.origin}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (activeUserId) {
    headers.set('User-ID', activeUserId.toString());
  }
  
  const fetchOptions = {
    ...options,
    headers
  };
  
  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }
    
    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

export function showToast(message, type = 'info') {
  let toastElement = document.getElementById('toast');
  if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.id = 'toast';
    document.body.appendChild(toastElement);
  }
  
  toastElement.textContent = message;
  toastElement.className = `toast ${type}`;
  
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
  }
  
  window.toastTimeout = setTimeout(() => {
    toastElement.classList.add('hidden');
  }, 3000);
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Global Nav & Modal Initializer
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initComposeModal();
});

function initNavigation() {
  const path = window.location.pathname;
  let pageName = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  
  // Normalize root slash
  if (pageName === '') pageName = 'index.html';

  // Highlight active link in sidebar and bottom navigation
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (pageName === href || (pageName === 'index.html' && href === '/'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');
  bottomNavItems.forEach(item => {
    const tab = item.getAttribute('data-tab');
    if (tab) {
      const match = (tab === 'feed' && pageName === 'index.html') || (pageName === `${tab}.html`);
      if (match) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
  });

  // Mobile navigation button clicks (redirections)
  bottomNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (tabId === 'compose') {
        openComposeModal();
      } else if (tabId === 'feed') {
        window.location.href = 'index.html';
      } else if (tabId) {
        window.location.href = `${tabId}.html`;
      }
    });
  });

  // Update header avatar / sidebar if logged in
  updateActiveUserUI();
}

export async function updateActiveUserUI() {
  if (activeUserId) {
    try {
      const user = await fetchAPI(`/api/users/${activeUserId}`);
      if (user) {
        document.querySelectorAll('.current-user-avatar').forEach(avatar => {
          avatar.textContent = user.username[0].toUpperCase();
          avatar.classList.add('logged-in');
        });
        
        // Populate mini profile summary in desktop sidebar if present
        const sidebarProfileCard = document.getElementById('sidebar-active-profile');
        if (sidebarProfileCard) {
          sidebarProfileCard.classList.remove('hidden');
          document.getElementById('sidebar-username').textContent = user.username;
          document.getElementById('sidebar-avatar').textContent = user.username[0].toUpperCase();
          document.getElementById('sidebar-posts').textContent = user.stats.posts;
          document.getElementById('sidebar-followers').textContent = user.stats.followers;
          document.getElementById('sidebar-following').textContent = user.stats.following;
        }
      }
    } catch (e) {
      console.error('Failed to update active user UI, logging out:', e);
      localStorage.removeItem('pulse_active_user_id');
      activeUserId = null;
      resetNavUI();
    }
  } else {
    resetNavUI();
  }
}

function resetNavUI() {
  document.querySelectorAll('.current-user-avatar').forEach(avatar => {
    avatar.textContent = '?';
    avatar.classList.remove('logged-in');
  });
  const sidebarProfileCard = document.getElementById('sidebar-active-profile');
  if (sidebarProfileCard) {
    sidebarProfileCard.classList.add('hidden');
  }
}

// Modal Compose Setup
function initComposeModal() {
  const composeModal = document.getElementById('compose-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const modalPostContent = document.getElementById('modal-post-content');
  const modalCreatePostBtn = document.getElementById('modal-create-post-btn');
  const modalCharCount = document.getElementById('modal-char-count');

  if (!composeModal) return;

  closeModalBtn.addEventListener('click', () => {
    composeModal.classList.add('hidden');
  });

  modalPostContent.addEventListener('input', (e) => {
    const len = e.target.value.length;
    modalCharCount.textContent = len;
    modalCreatePostBtn.disabled = len === 0 || len > 280;
    
    if (len > 260) {
      modalCharCount.className = 'char-counter danger';
    } else if (len > 220) {
      modalCharCount.className = 'char-counter warning';
    } else {
      modalCharCount.className = 'char-counter';
    }
  });

  modalCreatePostBtn.addEventListener('click', async () => {
    const content = modalPostContent.value.trim();
    if (!content) return;
    modalCreatePostBtn.disabled = true;

    try {
      const post = await fetchAPI('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      
      if (post) {
        showToast('Post published successfully!', 'success');
        modalPostContent.value = '';
        composeModal.classList.add('hidden');
        
        // Refresh page contents depending on page
        if (window.refreshPageData) {
          window.refreshPageData();
        } else {
          // Fallback redirect to index (feed) page
          window.location.href = 'index.html';
        }
      }
    } catch (e) {
      showToast('Failed to publish post.', 'error');
      modalCreatePostBtn.disabled = false;
    }
  });

  // Mobile Header Avatar clicks redirect to profile.html
  const headerAvatar = document.getElementById('header-avatar');
  if (headerAvatar) {
    headerAvatar.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }
}

export function openComposeModal() {
  if (!activeUserId) {
    showToast('Please log in or select a profile first.', 'error');
    window.location.href = 'profile.html';
    return;
  }
  const composeModal = document.getElementById('compose-modal');
  if (composeModal) {
    composeModal.classList.remove('hidden');
    document.getElementById('modal-post-content').value = '';
    document.getElementById('modal-char-count').textContent = '0';
    document.getElementById('modal-create-post-btn').disabled = true;
    document.getElementById('modal-post-content').focus();
  }
}
