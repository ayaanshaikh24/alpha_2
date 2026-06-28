import { activeUserId, fetchAPI, showToast, updateActiveUserUI } from './navigation.js';

let followingSet = new Set();
const suggestionsListFull = document.getElementById('suggestions-list-full');

document.addEventListener('DOMContentLoaded', () => {
  initPeople();
});

// Bridge function for mobile compose modal refresh
window.refreshPageData = async () => {
  await loadPeopleList();
  await updateActiveUserUI();
};

async function initPeople() {
  if (suggestionsListFull) {
    suggestionsListFull.addEventListener('click', handlePeopleClick);
  }
  await loadPeopleList();
}

async function loadPeopleList() {
  if (!suggestionsListFull) return;

  suggestionsListFull.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading users list...</p>
    </div>
  `;

  try {
    const response = await fetchAPI('/api/users');
    if (response) {
      const users = response.users || [];
      followingSet = new Set(response.followingIds || []);

      // Filter out current logged in user so they don't follow themselves
      const directoryUsers = users.filter(u => u.id !== activeUserId);
      
      suggestionsListFull.innerHTML = '';

      if (directoryUsers.length === 0) {
        suggestionsListFull.innerHTML = `
          <div class="no-suggestions" style="padding: 24px 0;">
            No other users found on GENZBOOK yet. Go to the "Profile" page and create another account to start testing!
          </div>
        `;
        return;
      }

      directoryUsers.forEach(user => {
        const isFollowing = followingSet.has(user.id);
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.style.padding = '16px 8px';
        
        item.innerHTML = `
          <div class="suggestion-user-info" data-user-id="${user.id}">
            <div class="avatar" style="width: 42px; height: 42px; font-size: 1.2rem;">
              ${user.username[0].toUpperCase()}
            </div>
            <div class="suggestion-meta" style="margin-left: 12px;">
              <span class="suggestion-username" style="font-size: 0.95rem; font-weight: 700;">${user.username}</span>
              <span class="suggestion-bio" style="font-size: 0.8rem; color: var(--text-secondary); white-space: normal; overflow: visible;">
                ${user.bio || 'No bio yet.'}
              </span>
            </div>
          </div>
          ${activeUserId ? `
            <button class="btn btn-sm follow-btn ${isFollowing ? 'btn-outline' : 'btn-primary'}" data-user-id="${user.id}" style="padding: 8px 14px;">
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          ` : ''}
        `;
        suggestionsListFull.appendChild(item);
      });
    }
  } catch (error) {
    suggestionsListFull.innerHTML = `<div class="no-suggestions">Error loading user directory.</div>`;
  }
}

async function handlePeopleClick(e) {
  const target = e.target;

  // 1. Follow / Unfollow Toggle
  if (target.classList.contains('follow-btn')) {
    const targetUserId = parseInt(target.getAttribute('data-user-id'), 10);
    await toggleFollow(targetUserId, target);
    return;
  }

  // 2. Click User Info -> Go to Profile Details: profile.html?id=X
  const userInfo = target.closest('.suggestion-user-info');
  if (userInfo) {
    const userId = parseInt(userInfo.getAttribute('data-user-id'), 10);
    if (userId) {
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
        followingSet.add(targetUserId);
        button.className = 'btn btn-sm btn-outline follow-btn';
        button.textContent = 'Following';
        showToast('User followed.', 'success');
      } else {
        followingSet.delete(targetUserId);
        button.className = 'btn btn-sm btn-primary follow-btn';
        button.textContent = 'Follow';
        showToast('User unfollowed.', 'info');
      }
      await updateActiveUserUI();
    }
  } catch (error) {
    showToast(error.message || 'Failed to update follow.', 'error');
  } finally {
    button.disabled = false;
  }
}
