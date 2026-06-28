// State Management
let activeUserId = localStorage.getItem('pulse_active_user_id') 
  ? parseInt(localStorage.getItem('pulse_active_user_id'), 10) 
  : null;
let usersCache = [];
let followingSet = new Set();
let expandedComments = new Set(); // Tracks which post IDs have expanded comments section

// DOM Elements
const userSelector = document.getElementById('user-selector');
const newUsernameInput = document.getElementById('new-username');
const newBioInput = document.getElementById('new-bio');
const registerBtn = document.getElementById('register-btn');
const activeProfileCard = document.getElementById('active-profile-card');
const profileAvatar = document.getElementById('profile-avatar');
const profileUsername = document.getElementById('profile-username');
const profileBio = document.getElementById('profile-bio');
const statPosts = document.getElementById('stat-posts');
const statFollowers = document.getElementById('stat-followers');
const statFollowing = document.getElementById('stat-following');
const postContentInput = document.getElementById('post-content');
const createPostBtn = document.getElementById('create-post-btn');
const charCount = document.getElementById('char-count');
const postsFeed = document.getElementById('posts-feed');
const suggestionsList = document.getElementById('suggestions-list');
const toastElement = document.getElementById('toast');
const currentUserAvatar = document.querySelectorAll('.current-user-avatar');
const mobileHeaderAvatar = document.getElementById('header-avatar');
const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');
const tabSections = document.querySelectorAll('.tab-section');

// Modal Elements
const composeModal = document.getElementById('compose-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalPostContent = document.getElementById('modal-post-content');
const modalCreatePostBtn = document.getElementById('modal-create-post-btn');
const modalCharCount = document.getElementById('modal-char-count');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadAppState();
});

// Setup Events
function setupEventListeners() {
  // Mock login selector
  userSelector.addEventListener('change', (e) => {
    const val = e.target.value;
    setActiveUser(val ? parseInt(val, 10) : null);
  });

  // User registration
  registerBtn.addEventListener('click', handleRegistration);

  // Character counter for post
  postContentInput.addEventListener('input', (e) => {
    const len = e.target.value.length;
    charCount.textContent = len;
    createPostBtn.disabled = len === 0 || len > 280;
    
    // Add warnings based on length
    if (len > 260) {
      charCount.className = 'char-counter danger';
    } else if (len > 220) {
      charCount.className = 'char-counter warning';
    } else {
      charCount.className = 'char-counter';
    }
  });

  // Post creation
  createPostBtn.addEventListener('click', handleCreatePost);

  // Delegated events for feed posts (Likes, Comments, Follow, Replies)
  postsFeed.addEventListener('click', handleFeedClick);

  // Bottom Navigation Bar Switcher (Mobile)
  bottomNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (tabId === 'compose') {
        openComposeModal();
      } else {
        switchTab(tabId);
      }
    });
  });

  // Mobile avatar in header triggers profile tab
  mobileHeaderAvatar.addEventListener('click', () => {
    switchTab('profile');
  });

  // Compose Modal Close Trigger
  closeModalBtn.addEventListener('click', closeComposeModal);

  // Compose Modal character counter
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

  // Compose Modal publish trigger
  modalCreatePostBtn.addEventListener('click', handleModalCreatePost);
}

// ==========================================
// CORE APP STATE LOADERS
// ==========================================

async function loadAppState() {
  await loadUsers();
  
  if (activeUserId && usersCache.some(u => u.id === activeUserId)) {
    userSelector.value = activeUserId;
    await setActiveUser(activeUserId);
  } else {
    // No valid active user
    setActiveUser(null);
  }
  
  await loadPosts();
}

async function loadUsers() {
  try {
    const response = await fetchAPI('/api/users');
    if (response) {
      usersCache = response.users || [];
      followingSet = new Set(response.followingIds || []);
      
      // Populate Selector
      const currentSelected = userSelector.value;
      userSelector.innerHTML = '<option value="">-- Select Profile (Log In) --</option>';
      usersCache.forEach(u => {
        const option = document.createElement('option');
        option.value = u.id;
        option.textContent = u.username;
        userSelector.appendChild(option);
      });
      userSelector.value = currentSelected;
    }
  } catch (error) {
    showToast('Failed to load users list.', 'error');
  }
}

async function setActiveUser(userId) {
  activeUserId = userId;
  if (userId) {
    localStorage.setItem('pulse_active_user_id', userId);
    userSelector.value = userId;
    
    // Fetch detailed user profile for stats
    const profile = await fetchAPI(`/api/users/${userId}`);
    if (profile) {
      profileUsername.textContent = profile.username;
      profileBio.textContent = profile.bio || 'No bio yet...';
      profileAvatar.textContent = profile.username[0].toUpperCase();
      statPosts.textContent = profile.stats.posts;
      statFollowers.textContent = profile.stats.followers;
      statFollowing.textContent = profile.stats.following;
      
      activeProfileCard.classList.remove('hidden');
      currentUserAvatar.forEach(avatar => avatar.textContent = profile.username[0].toUpperCase());
    }
  } else {
    localStorage.removeItem('pulse_active_user_id');
    userSelector.value = '';
    activeProfileCard.classList.add('hidden');
    currentUserAvatar.forEach(avatar => avatar.textContent = '?');
  }
  
  // Re-sync users lists to update following sets and suggestions sidebar
  await loadUsers();
  renderFollowSuggestions();
  
  // Re-render feed elements (since action buttons depend on who is logged in)
  if (postsFeed.querySelector('.post-card')) {
    await loadPosts();
  }
}

// ==========================================
// RENDER RECOMMENDATIONS (WHO TO FOLLOW)
// ==========================================

function renderFollowSuggestions() {
  suggestionsList.innerHTML = '';
  
  // filter out current active user
  const suggestions = usersCache.filter(u => u.id !== activeUserId);
  
  if (suggestions.length === 0) {
    suggestionsList.innerHTML = `<div class="no-suggestions">No other profiles exist yet. Create another account below to test following.</div>`;
    return;
  }
  
  suggestions.forEach(user => {
    const isFollowing = followingSet.has(user.id);
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <div class="suggestion-user-info" data-user-id="${user.id}">
        <div class="avatar">${user.username[0].toUpperCase()}</div>
        <div class="suggestion-meta">
          <span class="suggestion-username">${user.username}</span>
          <span class="suggestion-bio">${user.bio || 'No bio yet.'}</span>
        </div>
      </div>
      ${activeUserId ? `
        <button class="btn btn-sm follow-btn ${isFollowing ? 'btn-outline' : 'btn-primary'}" data-user-id="${user.id}">
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
      ` : ''}
    `;
    suggestionsList.appendChild(item);
  });
}

// ==========================================
// FEED & POST RENDERING
// ==========================================

async function loadPosts() {
  postsFeed.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading posts...</p>
    </div>
  `;
  
  try {
    const posts = await fetchAPI('/api/posts');
    if (!posts) return;
    
    if (posts.length === 0) {
      postsFeed.innerHTML = `
        <div class="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6L15.316 7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No posts published yet. Be the first to share something!</p>
        </div>
      `;
      return;
    }
    
    postsFeed.innerHTML = '';
    posts.forEach(post => {
      postsFeed.appendChild(createPostCard(post));
    });
  } catch (error) {
    postsFeed.innerHTML = `<div class="empty-state"><p>Error loading posts feed.</p></div>`;
  }
}

function createPostCard(post) {
  const isOwnPost = post.user.id === activeUserId;
  const isFollowingAuthor = followingSet.has(post.user.id);
  const hasLiked = post.hasLiked;
  const commentsExpanded = expandedComments.has(post.id);
  
  const card = document.createElement('article');
  card.className = 'card post-card';
  card.id = `post-${post.id}`;
  
  card.innerHTML = `
    <div class="post-header">
      <div class="post-user-info" data-user-id="${post.user.id}">
        <div class="avatar">${post.user.username[0].toUpperCase()}</div>
        <div>
          <span class="post-username">${post.user.username}</span>
          <span class="post-time">${formatDate(post.createdAt)}</span>
        </div>
      </div>
      
      <!-- Follow/Unfollow context button -->
      ${(activeUserId && !isOwnPost) ? `
        <button class="btn btn-sm follow-btn ${isFollowingAuthor ? 'btn-outline' : 'btn-primary'}" data-user-id="${post.user.id}">
          ${isFollowingAuthor ? 'Following' : 'Follow'}
        </button>
      ` : ''}
    </div>
    
    <div class="post-content">${escapeHTML(post.content)}</div>
    
    <div class="post-actions">
      <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" data-post-id="${post.id}">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span class="like-count">${post.stats.likes}</span>
      </button>
      
      <button class="action-btn comment-btn" data-post-id="${post.id}">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span class="comment-count">${post.stats.comments}</span>
      </button>
    </div>
    
    <!-- Comments Container (Collapsible) -->
    <div class="comments-section ${commentsExpanded ? '' : 'hidden'}" id="comments-sec-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}">
        <!-- Comments will populate here -->
      </div>
      
      <!-- Top level comment submission form -->
      ${activeUserId ? `
        <div class="post-comment-form">
          <div class="avatar">${profileUsername.textContent[0].toUpperCase()}</div>
          <div class="input-wrapper">
            <textarea class="form-control comment-input" placeholder="Write a comment..." rows="1" maxlength="200"></textarea>
            <div class="btn-group">
              <button class="btn btn-primary btn-sm submit-comment-btn" data-post-id="${post.id}">Comment</button>
            </div>
          </div>
        </div>
      ` : '<p class="helper-text" style="margin-top:12px">Log in to comment on this post.</p>'}
    </div>
  `;
  
  if (commentsExpanded) {
    loadPostComments(post.id);
  }
  
  return card;
}

// ==========================================
// COMMENTS SECTION LOGIC (WITH NESTED TREE)
// ==========================================

async function loadPostComments(postId) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  
  container.innerHTML = '<div class="spinner" style="margin: 8px auto;"></div>';
  
  try {
    const comments = await fetchAPI(`/api/posts/${postId}/comments`);
    if (!comments) return;
    
    container.innerHTML = '';
    if (comments.length === 0) {
      container.innerHTML = '<p class="helper-text" style="text-align:center; padding: 10px 0;">No comments yet. Start the conversation!</p>';
      return;
    }
    
    renderCommentsTree(comments, container, postId);
  } catch (error) {
    container.innerHTML = '<p class="helper-text">Error loading comments.</p>';
  }
}

// Recursively builds the nested comments DOM nodes
function renderCommentsTree(comments, container, postId) {
  comments.forEach(comment => {
    const node = document.createElement('div');
    node.className = 'comment-node';
    node.id = `comment-node-${comment.id}`;
    
    node.innerHTML = `
      <div class="comment-body">
        <div class="avatar">${comment.user.username[0].toUpperCase()}</div>
        <div class="comment-main">
          <div class="comment-meta">
            <span class="comment-author" data-user-id="${comment.user.id}">${comment.user.username}</span>
            <span class="comment-time">${formatDate(comment.createdAt)}</span>
          </div>
          <div class="comment-content">${escapeHTML(comment.content)}</div>
          <div class="comment-actions">
            ${activeUserId ? `<button class="comment-action-btn reply-trigger-btn" data-comment-id="${comment.id}" data-post-id="${postId}">Reply</button>` : ''}
          </div>
        </div>
      </div>
      <!-- Reply insertion anchor -->
      <div class="reply-form-container" id="reply-form-container-${comment.id}"></div>
      <!-- Nested replies tree list -->
      <div class="replies-list" id="replies-list-${comment.id}"></div>
    `;
    
    container.appendChild(node);
    
    // If this comment has nested replies, render them recursively
    if (comment.replies && comment.replies.length > 0) {
      const repliesList = node.querySelector(`#replies-list-${comment.id}`);
      renderCommentsTree(comment.replies, repliesList, postId);
    }
  });
}

// ==========================================
// EVENT HANDLERS
// ==========================================

async function handleRegistration() {
  const username = newUsernameInput.value.trim();
  const bio = newBioInput.value.trim();
  
  if (!username) {
    showToast('Username is required.', 'error');
    return;
  }
  
  try {
    const user = await fetchAPI('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, bio })
    });
    
    if (user) {
      showToast(`Profile "${user.username}" created successfully!`, 'success');
      newUsernameInput.value = '';
      newBioInput.value = '';
      
      // Select the newly registered user as the active user
      await loadUsers();
      await setActiveUser(user.id);
      switchTab('feed');
    }
  } catch (error) {
    showToast(error.message || 'Registration failed.', 'error');
  }
}

async function handleCreatePost() {
  const content = postContentInput.value.trim();
  if (!content) return;
  
  createPostBtn.disabled = true;
  
  try {
    const post = await fetchAPI('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    
    if (post) {
      showToast('Post published successfully!', 'success');
      postContentInput.value = '';
      charCount.textContent = '0';
      createPostBtn.disabled = true;
      
      // Update statistics of active profile card and reload feed
      if (activeUserId) {
        await setActiveUser(activeUserId);
      }
      await loadPosts();
    }
  } catch (error) {
    showToast('Failed to publish post.', 'error');
    createPostBtn.disabled = false;
  }
}

async function handleFeedClick(e) {
  const target = e.target;
  
  // 1. Follow / Unfollow Toggles
  if (target.classList.contains('follow-btn')) {
    const targetUserId = parseInt(target.getAttribute('data-user-id'), 10);
    await toggleFollow(targetUserId);
    return;
  }
  
  // 2. Like / Unlike Post
  const likeBtn = target.closest('.like-btn');
  if (likeBtn) {
    const postId = parseInt(likeBtn.getAttribute('data-post-id'), 10);
    await toggleLike(postId, likeBtn);
    return;
  }
  
  // 3. Comments section Expand / Collapse Toggle
  const commentBtn = target.closest('.comment-btn');
  if (commentBtn) {
    const postId = parseInt(commentBtn.getAttribute('data-post-id'), 10);
    const commentsSec = document.getElementById(`comments-sec-${postId}`);
    
    if (expandedComments.has(postId)) {
      expandedComments.delete(postId);
      commentsSec.classList.add('hidden');
    } else {
      expandedComments.add(postId);
      commentsSec.classList.remove('hidden');
      loadPostComments(postId);
    }
    return;
  }
  
  // 4. Submit Top level Comment
  if (target.classList.contains('submit-comment-btn')) {
    const postId = parseInt(target.getAttribute('data-post-id'), 10);
    const textarea = target.closest('.input-wrapper').querySelector('.comment-input');
    const content = textarea.value.trim();
    
    if (!content) return;
    
    await submitComment(postId, null, content, textarea);
    return;
  }
  
  // 5. Open Inline Nested Reply Input Box
  if (target.classList.contains('reply-trigger-btn')) {
    const commentId = parseInt(target.getAttribute('data-comment-id'), 10);
    const postId = parseInt(target.getAttribute('data-post-id'), 10);
    showReplyForm(commentId, postId);
    return;
  }
  
  // 6. Submit Nested Reply
  if (target.classList.contains('submit-reply-btn')) {
    const commentId = parseInt(target.getAttribute('data-parent-id'), 10);
    const postId = parseInt(target.getAttribute('data-post-id'), 10);
    const textarea = document.getElementById(`reply-input-${commentId}`);
    const content = textarea.value.trim();
    
    if (!content) return;
    
    await submitComment(postId, commentId, content, textarea);
    return;
  }
  
  // 7. Cancel Nested Reply Form
  if (target.classList.contains('cancel-reply-btn')) {
    const commentId = parseInt(target.getAttribute('data-parent-id'), 10);
    const formContainer = document.getElementById(`reply-form-container-${commentId}`);
    formContainer.innerHTML = '';
    return;
  }
  
  // 8. Click on Username (Simulate profile viewing: switch perspective)
  const userInfo = target.closest('.post-user-info') || target.closest('.suggestion-user-info') || target.classList.contains('comment-author');
  if (userInfo) {
    const userId = parseInt(userInfo.getAttribute('data-user-id'), 10);
    if (userId && userId !== activeUserId) {
      if (confirm(`Switch view perspective to "${userInfo.textContent.trim()}"?`)) {
        await setActiveUser(userId);
        showToast(`Logged in as ${userInfo.textContent.trim()}`, 'info');
        switchTab('feed');
      }
    }
  }
}

async function toggleLike(postId, btn) {
  if (!activeUserId) {
    showToast('Please select/create a user profile to like posts.', 'error');
    return;
  }
  
  try {
    const response = await fetchAPI(`/api/posts/${postId}/like`, { method: 'POST' });
    if (response) {
      const likeCountSpan = btn.querySelector('.like-count');
      let currentCount = parseInt(likeCountSpan.textContent, 10);
      
      if (response.liked) {
        btn.classList.add('liked');
        likeCountSpan.textContent = currentCount + 1;
        showToast('Liked post.', 'success');
      } else {
        btn.classList.remove('liked');
        likeCountSpan.textContent = currentCount - 1;
        showToast('Unliked post.', 'info');
      }
    }
  } catch (error) {
    showToast('Failed to update like status.', 'error');
  }
}

async function toggleFollow(targetUserId) {
  if (!activeUserId) {
    showToast('Please select/create a user profile to follow users.', 'error');
    return;
  }
  
  try {
    const response = await fetchAPI(`/api/users/${targetUserId}/follow`, { method: 'POST' });
    if (response) {
      if (response.following) {
        followingSet.add(targetUserId);
        showToast('User followed.', 'success');
      } else {
        followingSet.delete(targetUserId);
        showToast('User unfollowed.', 'info');
      }
      
      // Refresh active user details (stats like "Following" count will update)
      await setActiveUser(activeUserId);
    }
  } catch (error) {
    showToast(error.message || 'Failed to update follow status.', 'error');
  }
}

function showReplyForm(commentId, postId) {
  // Clear any open reply forms first
  document.querySelectorAll('.reply-form-container').forEach(c => c.innerHTML = '');
  
  const container = document.getElementById(`reply-form-container-${commentId}`);
  container.innerHTML = `
    <div class="reply-form">
      <textarea id="reply-input-${commentId}" class="form-control" placeholder="Write a reply..." rows="1" maxlength="200"></textarea>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm cancel-reply-btn" data-parent-id="${commentId}">Cancel</button>
        <button class="btn btn-primary btn-sm submit-reply-btn" data-parent-id="${commentId}" data-post-id="${postId}">Reply</button>
      </div>
    </div>
  `;
  container.querySelector('textarea').focus();
}

async function submitComment(postId, parentId, content, inputElement) {
  try {
    const response = await fetchAPI(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId })
    });
    
    if (response) {
      showToast('Comment submitted!', 'success');
      inputElement.value = '';
      
      // Update comment count on post card
      const postCard = document.getElementById(`post-${postId}`);
      if (postCard) {
        const commentCountSpan = postCard.querySelector('.comment-count');
        const currentCount = parseInt(commentCountSpan.textContent, 10);
        commentCountSpan.textContent = currentCount + 1;
      }
      
      // Reload the comments tree for this post
      await loadPostComments(postId);
    }
  } catch (error) {
    showToast('Failed to post comment.', 'error');
  }
}

// ==========================================
// UTILITY FUNCTIONS & API CLIENT
// ==========================================

async function fetchAPI(endpoint, options = {}) {
  const url = `${window.location.origin}${endpoint}`;
  
  // Set headers
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
      throw new Error(data.error || 'Server request failed.');
    }
    
    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

function showToast(message, type = 'info') {
  toastElement.textContent = message;
  toastElement.className = `toast ${type}`;
  
  // Clear any existing timeout
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
  }
  
  window.toastTimeout = setTimeout(() => {
    toastElement.classList.add('hidden');
  }, 3000);
}

function formatDate(dateString) {
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

function escapeHTML(str) {
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

// ==========================================
// MOBILE TAB NAVIGATION & MODAL CONTROLLERS
// ==========================================

function switchTab(tabId) {
  bottomNavItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  tabSections.forEach(section => {
    if (section.id === `${tabId}-tab`) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });
}

function openComposeModal() {
  if (!activeUserId) {
    showToast('Please select/create a profile first to compose a post.', 'error');
    switchTab('profile');
    return;
  }
  composeModal.classList.remove('hidden');
  modalPostContent.value = '';
  modalCharCount.textContent = '0';
  modalCreatePostBtn.disabled = true;
  modalPostContent.focus();
}

function closeComposeModal() {
  composeModal.classList.add('hidden');
}

async function handleModalCreatePost() {
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
      closeComposeModal();
      
      // Update statistics of active profile card and reload feed
      if (activeUserId) {
        await setActiveUser(activeUserId);
      }
      await loadPosts();
      switchTab('feed');
    }
  } catch (error) {
    showToast('Failed to publish post.', 'error');
    modalCreatePostBtn.disabled = false;
  }
}
