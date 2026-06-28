import { activeUserId, fetchAPI, showToast, formatDate, escapeHTML, updateActiveUserUI } from './navigation.js';

// URL Parameter Parsing
const params = new URLSearchParams(window.location.search);
let targetUserId = parseInt(params.get('id'), 10) || null;

// DOM Elements
const profilePageTitle = document.getElementById('profile-page-title');
const targetProfileCard = document.getElementById('target-profile-card');
const viewAvatar = document.getElementById('view-avatar');
const viewUsername = document.getElementById('view-username');
const viewBio = document.getElementById('view-bio');
const viewPostsCount = document.getElementById('view-posts');
const viewFollowersCount = document.getElementById('view-followers');
const viewFollowingCount = document.getElementById('view-following');
const profileActionBtnContainer = document.getElementById('profile-action-btn-container');

const sessionsManager = document.getElementById('sessions-manager');
const userSelector = document.getElementById('user-selector');
const newUsernameInput = document.getElementById('new-username');
const newBioInput = document.getElementById('new-bio');
const registerBtn = document.getElementById('register-btn');
const postsTitle = document.getElementById('posts-title');
const profilePostsFeed = document.getElementById('profile-posts-feed');

const logoutContainer = document.getElementById('logout-container');
const logoutBtn = document.getElementById('logout-btn');

document.addEventListener('DOMContentLoaded', () => {
  initProfilePage();
});

// Bridge function for mobile compose modal refresh
window.refreshPageData = async () => {
  await loadProfileDetails();
  await loadUserPosts();
  await updateActiveUserUI();
};

async function initProfilePage() {
  // If no target ID in URL, check if active user is logged in
  if (!targetUserId && activeUserId) {
    targetUserId = activeUserId;
  }

  // Setup Event Listeners
  if (userSelector) {
    userSelector.addEventListener('change', handleSessionSwitch);
  }
  if (registerBtn) {
    registerBtn.addEventListener('click', handleRegistration);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  if (profilePostsFeed) {
    profilePostsFeed.addEventListener('click', handleFeedClick);
  }

  await loadSessionsList();
  await loadProfileDetails();
  await loadUserPosts();
}

async function loadSessionsList() {
  if (!userSelector) return;
  
  try {
    const response = await fetchAPI('/api/users');
    if (response) {
      const users = response.users || [];
      userSelector.innerHTML = '<option value="">-- Select Profile (Log In) --</option>';
      users.forEach(u => {
        const option = document.createElement('option');
        option.value = u.id;
        option.textContent = u.username;
        if (u.id === activeUserId) {
          option.textContent += ' (Active)';
        }
        userSelector.appendChild(option);
      });
      userSelector.value = activeUserId || '';
    }
  } catch (error) {
    console.error('Failed to load profiles:', error);
  }
}

async function loadProfileDetails() {
  if (!targetUserId) {
    // No logged in session and no targeted profile URL parameter
    targetProfileCard.classList.add('hidden');
    sessionsManager.classList.remove('hidden');
    logoutContainer.classList.add('hidden');
    profilePageTitle.textContent = 'Account Sessions';
    return;
  }

  try {
    const profile = await fetchAPI(`/api/users/${targetUserId}`);
    if (profile) {
      profilePageTitle.textContent = profile.username === activeUserId ? 'Your Profile' : `${profile.username}'s Profile`;
      
      viewUsername.textContent = profile.username;
      viewBio.textContent = profile.bio || 'No bio yet...';
      viewAvatar.textContent = profile.username[0].toUpperCase();
      viewPostsCount.textContent = profile.stats.posts;
      viewFollowersCount.textContent = profile.stats.followers;
      viewFollowingCount.textContent = profile.stats.following;
      
      targetProfileCard.classList.remove('hidden');
      
      // Render Action Buttons (Follow/Unfollow or Switch perspective)
      renderActionButtons(profile);
      
      // If viewing own profile, show sessions manager below it
      if (targetUserId === activeUserId) {
        sessionsManager.classList.remove('hidden');
        logoutContainer.classList.remove('hidden');
      } else {
        sessionsManager.classList.add('hidden');
        logoutContainer.classList.add('hidden');
      }
    }
  } catch (error) {
    showToast('Failed to load profile details.', 'error');
    targetProfileCard.classList.add('hidden');
  }
}

function renderActionButtons(profile) {
  if (!profileActionBtnContainer) return;
  profileActionBtnContainer.innerHTML = '';
  
  if (!activeUserId) {
    // Not logged in -> Show switch perspective button
    profileActionBtnContainer.innerHTML = `
      <button class="btn btn-outline btn-sm switch-view-btn" data-user-id="${profile.id}">
        Login as ${profile.username}
      </button>
    `;
    return;
  }

  if (profile.id === activeUserId) {
    // Viewing own profile
    profileActionBtnContainer.innerHTML = `<span class="active-badge" style="padding: 6px 12px; font-size: 0.75rem;">Active Session</span>`;
    return;
  }

  // Viewing someone else's profile while logged in -> Show Follow & Perspective buttons
  profileActionBtnContainer.innerHTML = `
    <div style="display: flex; gap: 8px;">
      <button class="btn btn-sm follow-btn ${profile.isFollowing ? 'btn-outline' : 'btn-primary'}" data-user-id="${profile.id}">
        ${profile.isFollowing ? 'Following' : 'Follow'}
      </button>
      <button class="btn btn-outline btn-sm switch-view-btn" data-user-id="${profile.id}">
        Switch View
      </button>
    </div>
  `;
}

async function loadUserPosts() {
  if (!profilePostsFeed) return;

  if (!targetUserId) {
    profilePostsFeed.innerHTML = `
      <div class="empty-state">
        <p>Please log in or select a profile to view posts.</p>
      </div>
    `;
    if (postsTitle) postsTitle.classList.add('hidden');
    return;
  }

  profilePostsFeed.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';

  try {
    const posts = await fetchAPI('/api/posts');
    const userPosts = posts.filter(post => post.user.id === targetUserId);
    
    if (postsTitle) postsTitle.classList.remove('hidden');
    profilePostsFeed.innerHTML = '';

    if (userPosts.length === 0) {
      profilePostsFeed.innerHTML = `
        <div class="empty-state">
          <p>No posts published by this user yet.</p>
        </div>
      `;
      return;
    }

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
        <div class="avatar">${post.user.username[0].toUpperCase()}</div>
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

// ==========================================
// SESSION & SWITCHING HANDLERS
// ==========================================

async function handleSessionSwitch(e) {
  const userId = e.target.value;
  if (userId) {
    localStorage.setItem('pulse_active_user_id', userId);
    showToast('Session updated successfully!', 'success');
    window.location.href = 'index.html';
  } else {
    handleLogout();
  }
}

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
      showToast(`Logged in as "${user.username}"!`, 'success');
      localStorage.setItem('pulse_active_user_id', user.id);
      window.location.href = 'index.html';
    }
  } catch (error) {
    showToast(error.message || 'Registration failed.', 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('pulse_active_user_id');
  showToast('Logged out of session.', 'info');
  window.location.href = 'profile.html';
}

// ==========================================
// INTERACTIVE ACTIONS ON USER POSTS
// ==========================================

async function handleFeedClick(e) {
  const target = e.target;

  // 1. Perspective Switch Button on profile header
  if (target.classList.contains('switch-view-btn')) {
    const userId = parseInt(target.getAttribute('data-user-id'), 10);
    if (userId) {
      localStorage.setItem('pulse_active_user_id', userId);
      showToast('Switched session view!', 'success');
      window.location.href = 'index.html';
    }
    return;
  }

  // 2. Follow / Unfollow Button on profile header
  if (target.classList.contains('follow-btn')) {
    const targetUserId = parseInt(target.getAttribute('data-user-id'), 10);
    await toggleFollow(targetUserId, target);
    return;
  }

  // 3. Like / Unlike Post on profile feed list
  const likeBtn = target.closest('.like-btn');
  if (likeBtn) {
    const postId = parseInt(likeBtn.getAttribute('data-post-id'), 10);
    await toggleLike(postId, likeBtn);
    return;
  }
  
  // 4. Click Username in feed post -> Redirect to their profile
  const userInfo = target.closest('.post-user-info');
  if (userInfo) {
    const userId = parseInt(userInfo.getAttribute('data-user-id'), 10);
    if (userId && userId !== targetUserId) {
      window.location.href = `profile.html?id=${userId}`;
    }
  }
}

async function toggleFollow(targetUserId, button) {
  if (!activeUserId) {
    showToast('Please login or switch to a profile to follow users.', 'error');
    return;
  }

  button.disabled = true;

  try {
    const response = await fetchAPI(`/api/users/${targetUserId}/follow`, { method: 'POST' });
    if (response) {
      if (response.following) {
        button.className = 'btn btn-sm btn-outline follow-btn';
        button.textContent = 'Following';
        showToast('User followed.', 'success');
      } else {
        button.className = 'btn btn-sm btn-primary follow-btn';
        button.textContent = 'Follow';
        showToast('User unfollowed.', 'info');
      }
      // Reload stats and active UI
      await loadProfileDetails();
      await updateActiveUserUI();
    }
  } catch (error) {
    showToast(error.message || 'Failed to update follow.', 'error');
  } finally {
    button.disabled = false;
  }
}

async function toggleLike(postId, btn) {
  if (!activeUserId) {
    showToast('Please login or switch to a profile to like posts.', 'error');
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
    showToast('Failed to update like.', 'error');
  }
}
