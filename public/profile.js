import { activeUserId, fetchAPI, showToast, formatDate, escapeHTML, updateActiveUserUI } from './navigation.js';

// Profile Page State
let profileUserId = null;
let followingSet = new Set();
let selectedPfpBase64 = null;
let editSelectedPfpBase64 = null;

// DOM Elements
const setupProfilePanel = document.getElementById('setup-profile-panel');
const targetProfileCard = document.getElementById('target-profile-card');
const profilePostsFeed = document.getElementById('profile-posts-feed');
const postsTitle = document.getElementById('posts-title');
const logoutContainer = document.getElementById('logout-container');
const logoutBtn = document.getElementById('logout-btn');

// Setup View Mode Elements
const viewAvatar = document.getElementById('view-avatar');
const viewUsername = document.getElementById('view-username');
const viewBio = document.getElementById('view-bio');
const viewPostsSpan = document.getElementById('view-posts');
const viewFollowersSpan = document.getElementById('view-followers');
const viewFollowingSpan = document.getElementById('view-following');
const actionBtnContainer = document.getElementById('profile-action-btn-container');

// Setup Edit Mode Elements
const profileViewMode = document.getElementById('profile-view-mode');
const profileEditMode = document.getElementById('profile-edit-mode');
const editPfpTrigger = document.getElementById('edit-pfp-trigger');
const editPfpInput = document.getElementById('edit-pfp-input');
const editPfpPreview = document.getElementById('edit-pfp-preview');
const editUsernameInput = document.getElementById('edit-username-input');
const editBioInput = document.getElementById('edit-bio-input');
const editCancelBtn = document.getElementById('edit-cancel-btn');
const editSaveBtn = document.getElementById('edit-save-btn');

// First-Time Setup Elements
const setupPfpTrigger = document.getElementById('setup-pfp-trigger');
const setupPfpInput = document.getElementById('setup-pfp-input');
const setupPfpPreview = document.getElementById('setup-pfp-preview');
const setupUsernameInput = document.getElementById('setup-username');
const setupBioTextarea = document.getElementById('setup-bio');
const setupRegisterBtn = document.getElementById('setup-register-btn');

// Compose Box Elements (in profile.html)
const desktopCreatePostBox = document.getElementById('desktop-create-post');
const postContentInput = document.getElementById('post-content');
const createPostBtn = document.getElementById('create-post-btn');
const charCount = document.getElementById('char-count');
const postImageInput = document.getElementById('post-image-input');
const postImageBtn = document.getElementById('post-image-btn');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removePreviewBtn = document.getElementById('remove-preview-btn');

let selectedImageBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
  initProfilePage();
});

// Expose refresh function to navigation compose modal
window.refreshPageData = async () => {
  if (profileUserId) {
    await loadProfileDetails(profileUserId);
    await loadUserPosts(profileUserId);
  }
};

async function initProfilePage() {
  // Determine which profile to load (from query params)
  const urlParams = new URLSearchParams(window.location.search);
  const queryId = parseInt(urlParams.get('id'), 10);
  
  // Setup Log Out Action
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('pulse_active_user_id');
      showToast('Logged out of session.', 'info');
      window.location.href = 'profile.html';
    });
  }

  // Bind first-time setup actions
  initSetupPanel();

  // If not logged in and no query ID, show First-Time Setup
  if (!activeUserId && isNaN(queryId)) {
    setupProfilePanel.classList.remove('hidden');
    targetProfileCard.classList.add('hidden');
    postsTitle.classList.add('hidden');
    logoutContainer.classList.add('hidden');
    return;
  }

  // Set default profile ID to current session if none is provided in URL
  profileUserId = isNaN(queryId) ? activeUserId : queryId;

  if (activeUserId) {
    logoutContainer.classList.remove('hidden');
  }

  // Load profile page
  await loadProfileDetails(profileUserId);
  await loadUserPosts(profileUserId);
  
  // Bind Edit Profile Action Events
  initEditProfileForm();

  // Initialize Compose Box
  initComposeBox();
}

function initSetupPanel() {
  if (!setupPfpTrigger || !setupPfpInput) return;

  setupPfpTrigger.addEventListener('click', () => {
    setupPfpInput.click();
  });

  setupPfpInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'error');
      setupPfpInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      selectedPfpBase64 = event.target.result;
      setupPfpPreview.src = selectedPfpBase64;
      setupPfpPreview.style.display = 'block';
      
      const overlay = document.getElementById('setup-pfp-overlay');
      if (overlay) overlay.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  });

  if (setupRegisterBtn) {
    setupRegisterBtn.addEventListener('click', async () => {
      const username = setupUsernameInput.value.trim();
      const bio = setupBioTextarea.value.trim();

      if (!username) {
        showToast('Username is required.', 'error');
        return;
      }

      setupRegisterBtn.disabled = true;

      try {
        const user = await fetchAPI('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            bio: bio || null,
            pfp: selectedPfpBase64
          })
        });

        if (user && user.id) {
          showToast('Profile created successfully!', 'success');
          localStorage.setItem('pulse_active_user_id', user.id);
          window.location.href = 'profile.html';
        }
      } catch (err) {
        showToast(err.message || 'Failed to create profile.', 'error');
        setupRegisterBtn.disabled = false;
      }
    });
  }
}

async function loadProfileDetails(userId) {
  if (!targetProfileCard) return;

  try {
    const user = await fetchAPI(`/api/users/${userId}`);
    if (!user) {
      targetProfileCard.innerHTML = `<div class="empty-state"><p>User not found.</p></div>`;
      targetProfileCard.classList.remove('hidden');
      return;
    }

    // Set page title
    document.title = `GENZBOOK - ${user.username}'s Profile`;
    
    // Set Avatar (render custom PFP if present, else colored letter)
    if (user.pfp) {
      viewAvatar.innerHTML = `<img src="${user.pfp}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
    } else {
      viewAvatar.textContent = user.username[0].toUpperCase();
    }

    viewUsername.textContent = user.username;
    viewBio.textContent = user.bio || 'No bio written yet.';
    
    // Stats
    viewPostsSpan.textContent = user.stats.posts;
    viewFollowersSpan.textContent = user.stats.followers;
    viewFollowingSpan.textContent = user.stats.following;

    // Render Action Buttons
    actionBtnContainer.innerHTML = '';
    const isOwnProfile = user.id === activeUserId;

    if (isOwnProfile) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-outline btn-sm';
      editBtn.textContent = 'Edit Profile';
      editBtn.addEventListener('click', () => toggleEditMode(user));
      actionBtnContainer.appendChild(editBtn);
    } else if (activeUserId) {
      const followBtn = document.createElement('button');
      const isFollowing = user.isFollowing;
      followBtn.className = `btn btn-sm ${isFollowing ? 'btn-outline' : 'btn-primary'}`;
      followBtn.textContent = isFollowing ? 'Following' : 'Follow';
      followBtn.addEventListener('click', async () => {
        try {
          const response = await fetchAPI(`/api/users/${user.id}/follow`, { method: 'POST' });
          if (response) {
            showToast(response.following ? 'Followed user!' : 'Unfollowed user.', 'success');
            await loadProfileDetails(userId);
            await updateActiveUserUI();
          }
        } catch (e) {
          showToast('Failed to update follow.', 'error');
        }
      });
      actionBtnContainer.appendChild(followBtn);
    }

    targetProfileCard.classList.remove('hidden');
  } catch (error) {
    targetProfileCard.innerHTML = `<div class="empty-state"><p>Error loading profile details.</p></div>`;
    targetProfileCard.classList.remove('hidden');
  }
}

function toggleEditMode(user) {
  profileViewMode.classList.add('hidden');
  profileEditMode.classList.remove('hidden');

  editUsernameInput.value = user.username;
  editBioInput.value = user.bio || '';
  
  if (user.pfp) {
    editPfpPreview.src = user.pfp;
    editPfpPreview.style.display = 'block';
    editSelectedPfpBase64 = user.pfp;
    const overlay = document.getElementById('edit-pfp-overlay');
    if (overlay) overlay.style.display = 'flex';
  } else {
    editPfpPreview.src = '';
    editPfpPreview.style.display = 'none';
    editSelectedPfpBase64 = null;
    const overlay = document.getElementById('edit-pfp-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

function initEditProfileForm() {
  if (!editPfpTrigger || !editPfpInput) return;

  // Single binding to prevent duplicate listeners
  if (!editPfpTrigger.dataset.bound) {
    editPfpTrigger.addEventListener('click', () => {
      editPfpInput.click();
    });

    editPfpInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file.', 'error');
        editPfpInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        editSelectedPfpBase64 = event.target.result;
        editPfpPreview.src = editSelectedPfpBase64;
        editPfpPreview.style.display = 'block';
        
        const overlay = document.getElementById('edit-pfp-overlay');
        if (overlay) overlay.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    });

    editCancelBtn.addEventListener('click', () => {
      profileEditMode.classList.add('hidden');
      profileViewMode.classList.remove('hidden');
    });

    editSaveBtn.addEventListener('click', async () => {
      const username = editUsernameInput.value.trim();
      const bio = editBioInput.value.trim();

      if (!username) {
        showToast('Username cannot be empty.', 'error');
        return;
      }

      editSaveBtn.disabled = true;

      try {
        const user = await fetchAPI(`/api/users/${activeUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            username,
            bio: bio || null,
            pfp: editSelectedPfpBase64
          })
        });

        if (user) {
          showToast('Profile updated successfully!', 'success');
          profileEditMode.classList.add('hidden');
          profileViewMode.classList.remove('hidden');
          
          await loadProfileDetails(activeUserId);
          await updateActiveUserUI();
          await loadUserPosts(activeUserId);
        }
      } catch (err) {
        showToast(err.message || 'Failed to update profile.', 'error');
      } finally {
        editSaveBtn.disabled = false;
      }
    });

    editPfpTrigger.dataset.bound = "true";
  }
}

async function loadUserPosts(userId) {
  if (!profilePostsFeed) return;

  profilePostsFeed.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading posts...</p>
    </div>
  `;

  try {
    const posts = await fetchAPI('/api/posts');
    if (!posts) return;

    // Filter to only user's posts
    const userPosts = posts.filter(post => post.user.id === userId);
    profilePostsFeed.innerHTML = '';
    
    if (userPosts.length === 0) {
      postsTitle.classList.add('hidden');
      profilePostsFeed.innerHTML = `
        <div class="empty-state">
          <p>No posts published by this user yet.</p>
        </div>
      `;
      return;
    }

    postsTitle.classList.remove('hidden');
    userPosts.forEach(post => {
      profilePostsFeed.appendChild(createProfilePostCard(post));
    });
  } catch (error) {
    profilePostsFeed.innerHTML = `<div class="empty-state"><p>Error loading posts.</p></div>`;
  }
}

function createProfilePostCard(post) {
  const hasLiked = post.hasLiked;
  const card = document.createElement('article');
  card.className = 'card post-card';
  card.id = `post-${post.id}`;
  
  card.innerHTML = `
    <div class="post-header">
      <div class="post-user-info" data-user-id="${post.user.id}">
        <div class="avatar" style="overflow: hidden;">
          ${post.user.pfp ? `<img src="${post.user.pfp}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` : post.user.username[0].toUpperCase()}
        </div>
        <div>
          <span class="post-username">${post.user.username}</span>
          <span class="post-time">${formatDate(post.createdAt)}</span>
        </div>
      </div>
    </div>
    
    <div class="post-content">${escapeHTML(post.content)}</div>
    ${post.image ? `<img src="${post.image}" class="post-image" alt="Post Image">` : ''}
    
    <div class="post-actions" style="border-bottom: none; padding-bottom: 0;">
      <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" data-post-id="${post.id}">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span class="like-count">${post.stats.likes}</span>
      </button>
      
      <div class="action-btn comment-btn" style="cursor: default;">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span class="comment-count">${post.stats.comments}</span>
      </div>
    </div>
  `;
  return card;
}

function initComposeBox() {
  if (profileUserId === activeUserId && activeUserId) {
    if (desktopCreatePostBox) desktopCreatePostBox.classList.remove('hidden');
  } else {
    if (desktopCreatePostBox) desktopCreatePostBox.classList.add('hidden');
    return;
  }

  // Setup Event Listeners (only once)
  if (!postContentInput.dataset.bound) {
    postContentInput.addEventListener('input', (e) => {
      const len = e.target.value.length;
      charCount.textContent = len;
      createPostBtn.disabled = len === 0 || len > 280;
      
      if (len > 260) {
        charCount.className = 'char-counter danger';
      } else if (len > 220) {
        charCount.className = 'char-counter warning';
      } else {
        charCount.className = 'char-counter';
      }
    });

    createPostBtn.addEventListener('click', handleCreatePost);

    if (postImageBtn && postImageInput) {
      postImageBtn.addEventListener('click', () => {
        postImageInput.click();
      });

      postImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file.', 'error');
          postImageInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          selectedImageBase64 = event.target.result;
          imagePreview.src = selectedImageBase64;
          imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      });
    }

    if (removePreviewBtn) {
      removePreviewBtn.addEventListener('click', () => {
        selectedImageBase64 = null;
        imagePreview.src = '';
        imagePreviewContainer.classList.add('hidden');
        if (postImageInput) postImageInput.value = '';
      });
    }

    postContentInput.dataset.bound = "true";
  }
}

async function handleCreatePost() {
  const content = postContentInput.value.trim();
  if (!content) return;
  
  createPostBtn.disabled = true;
  
  try {
    const post = await fetchAPI('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content, image: selectedImageBase64 })
    });
    
    if (post) {
      showToast('Post published successfully!', 'success');
      postContentInput.value = '';
      charCount.textContent = '0';
      createPostBtn.disabled = true;
      
      // Clear image preview state
      selectedImageBase64 = null;
      imagePreview.src = '';
      imagePreviewContainer.classList.add('hidden');
      if (postImageInput) postImageInput.value = '';
      
      await updateActiveUserUI();
      // Reload stats and user posts
      await loadProfileDetails(profileUserId);
      await loadUserPosts(profileUserId);
    }
  } catch (error) {
    showToast('Failed to publish post.', 'error');
    createPostBtn.disabled = false;
  }
}
