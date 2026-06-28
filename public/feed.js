import { activeUserId, fetchAPI, showToast, formatDate, escapeHTML, updateActiveUserUI } from './navigation.js';

// Feed State
let followingSet = new Set();
let expandedComments = new Set();

// DOM Elements
const postsFeed = document.getElementById('posts-feed');
const suggestionsList = document.getElementById('suggestions-list');
const postContentInput = document.getElementById('post-content');
const createPostBtn = document.getElementById('create-post-btn');
const charCount = document.getElementById('char-count');
const desktopCreatePostBox = document.getElementById('desktop-create-post');

// Image Upload selectors
const postImageInput = document.getElementById('post-image-input');
const postImageBtn = document.getElementById('post-image-btn');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removePreviewBtn = document.getElementById('remove-preview-btn');

let selectedImageBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
  initFeed();
});

// Expose refresh function to navigation compose modal
window.refreshPageData = async () => {
  await loadPosts();
  await loadFeedSuggestions();
  await updateActiveUserUI();
};

async function initFeed() {
  // Hide compose box on desktop if not logged in
  if (!activeUserId) {
    if (desktopCreatePostBox) desktopCreatePostBox.classList.add('hidden');
  } else {
    if (desktopCreatePostBox) desktopCreatePostBox.classList.remove('hidden');
  }

  // Setup Event Listeners
  if (postContentInput && createPostBtn) {
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
  }

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

  if (postsFeed) {
    postsFeed.addEventListener('click', handleFeedClick);
  }

  // Initial Load
  await loadFeedSuggestions();
  await loadPosts();
}

async function loadFeedSuggestions() {
  if (!suggestionsList) return;
  
  try {
    const response = await fetchAPI('/api/users');
    if (response) {
      const users = response.users || [];
      followingSet = new Set(response.followingIds || []);
      
      // Filter out active user
      const suggestions = users.filter(u => u.id !== activeUserId);
      suggestionsList.innerHTML = '';
      
      if (suggestions.length === 0) {
        suggestionsList.innerHTML = `<div class="no-suggestions">No other profiles exist yet. Create another account in the Profile tab to follow someone!</div>`;
        return;
      }
      
      suggestions.forEach(user => {
        const isFollowing = followingSet.has(user.id);
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <div class="suggestion-user-info" data-user-id="${user.id}">
            <div class="avatar" style="overflow: hidden;">${user.pfp ? `<img src="${user.pfp}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` : user.username[0].toUpperCase()}</div>
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
  } catch (error) {
    console.error('Failed to load suggestions:', error);
  }
}

async function loadPosts() {
  if (!postsFeed) return;
  
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
          <p>No posts published yet. Share something with the world!</p>
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
        <div class="avatar" style="overflow: hidden;">${post.user.pfp ? `<img src="${post.user.pfp}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` : post.user.username[0].toUpperCase()}</div>
        <div>
          <span class="post-username">${post.user.username}</span>
          <span class="post-time">${formatDate(post.createdAt)}</span>
        </div>
      </div>
      
      ${(activeUserId && !isOwnPost) ? `
        <button class="btn btn-sm follow-btn ${isFollowingAuthor ? 'btn-outline' : 'btn-primary'}" data-user-id="${post.user.id}">
          ${isFollowingAuthor ? 'Following' : 'Follow'}
        </button>
      ` : ''}
    </div>
    
    <div class="post-content">${escapeHTML(post.content)}</div>
    ${post.image ? `<img src="${post.image}" class="post-image" alt="Post Image">` : ''}
    
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
    
    <div class="comments-section ${commentsExpanded ? '' : 'hidden'}" id="comments-sec-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}"></div>
      
      ${activeUserId ? `
        <div class="post-comment-form">
          <div class="avatar current-user-avatar">?</div>
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
      await loadPosts();
    }
  } catch (error) {
    showToast('Failed to publish post.', 'error');
    createPostBtn.disabled = false;
  }
}

async function handleFeedClick(e) {
  const target = e.target;
  
  // 1. Follow / Unfollow from suggestions or post header
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
  
  // 3. Comments section toggle
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
  
  // 5. Open Inline Nested Reply Form
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
  
  // 8. Click Username -> Navigate to profile.html?id=X (Multi-Page Profile Link!)
  const userInfo = target.closest('.post-user-info') || target.closest('.suggestion-user-info') || target.classList.contains('comment-author');
  if (userInfo) {
    const userId = parseInt(userInfo.getAttribute('data-user-id'), 10);
    if (userId) {
      window.location.href = `profile.html?id=${userId}`;
    }
  }
}

async function toggleLike(postId, btn) {
  if (!activeUserId) {
    showToast('Please select/create a profile first to like posts.', 'error');
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

async function toggleFollow(targetUserId) {
  if (!activeUserId) {
    showToast('Please login or switch to a profile to follow users.', 'error');
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
      
      await updateActiveUserUI();
      await loadFeedSuggestions();
      // Reload posts feed to update any follow buttons
      await loadPosts();
    }
  } catch (error) {
    showToast(error.message || 'Failed to update follow.', 'error');
  }
}

async function loadPostComments(postId) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  
  container.innerHTML = '<div class="spinner" style="margin: 8px auto;"></div>';
  
  try {
    const comments = await fetchAPI(`/api/posts/${postId}/comments`);
    if (!comments) return;
    
    container.innerHTML = '';
    if (comments.length === 0) {
      container.innerHTML = '<p class="helper-text" style="text-align:center; padding: 10px 0;">No comments yet.</p>';
      return;
    }
    
    renderCommentsTree(comments, container, postId);
  } catch (error) {
    container.innerHTML = '<p class="helper-text">Error loading comments.</p>';
  }
}

function renderCommentsTree(comments, container, postId) {
  comments.forEach(comment => {
    const node = document.createElement('div');
    node.className = 'comment-node';
    node.id = `comment-node-${comment.id}`;
    
    node.innerHTML = `
      <div class="comment-body">
        <div class="avatar" style="overflow: hidden;">${comment.user.pfp ? `<img src="${comment.user.pfp}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` : comment.user.username[0].toUpperCase()}</div>
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
      <div class="reply-form-container" id="reply-form-container-${comment.id}"></div>
      <div class="replies-list" id="replies-list-${comment.id}"></div>
    `;
    
    container.appendChild(node);
    
    if (comment.replies && comment.replies.length > 0) {
      const repliesList = node.querySelector(`#replies-list-${comment.id}`);
      renderCommentsTree(comment.replies, repliesList, postId);
    }
  });
}

function showReplyForm(commentId, postId) {
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
      
      const postCard = document.getElementById(`post-${postId}`);
      if (postCard) {
        const commentCountSpan = postCard.querySelector('.comment-count');
        const currentCount = parseInt(commentCountSpan.textContent, 10);
        commentCountSpan.textContent = currentCount + 1;
      }
      
      await loadPostComments(postId);
    }
  } catch (error) {
    showToast('Failed to post comment.', 'error');
  }
}
