import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Mock Authentication Middleware
// Parses the 'User-ID' header and attaches it to the request object.
app.use((req, res, next) => {
  const userIdHeader = req.headers['user-id'];
  if (userIdHeader) {
    req.userId = parseInt(userIdHeader, 10);
  }
  next();
});

// Helper wrapper to catch errors in async express handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================
// USER ENDPOINTS
// ==========================================

// Get all users and check who the current active user follows
app.get('/api/users', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      bio: true,
      pfp: true,
      createdAt: true
    }
  });

  let followingIds = [];
  if (req.userId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.userId },
      select: { followingId: true }
    });
    followingIds = follows.map(f => f.followingId);
  }

  res.json({ users, followingIds });
}));

// Create a new user (Registration)
app.post('/api/users', asyncHandler(async (req, res) => {
  const { username, bio, pfp } = req.body;
  
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required and cannot be empty.' });
  }

  const cleanUsername = username.trim();
  const cleanBio = bio && typeof bio === 'string' ? bio.trim() : null;

  try {
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        bio: cleanBio,
        pfp: pfp || null
      }
    });
    res.status(201).json(user);
  } catch (err) {
    // Check for Prisma unique key constraint error
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Username is already taken.' });
    }
    throw err;
  }
}));

// Get user profile details & stats by ID
app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid user ID format.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true
        }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Determine if current user is following this user
  let isFollowing = false;
  if (req.userId && req.userId !== targetId) {
    const followRecord = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.userId,
          followingId: targetId
        }
      }
    });
    isFollowing = !!followRecord;
  }

  res.json({
    id: user.id,
    username: user.username,
    bio: user.bio,
    pfp: user.pfp,
    createdAt: user.createdAt,
    stats: {
      posts: user._count.posts,
      followers: user._count.followers,
      following: user._count.following
    },
    isFollowing
  });
}));

// Update user profile details (bio, pfp, username)
app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const activeId = req.userId;

  if (!activeId || activeId !== id) {
    return res.status(401).json({ error: 'Unauthorized to edit this profile.' });
  }

  const { username, bio, pfp } = req.body;

  const updateData = {};
  if (username !== undefined) {
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'Username cannot be empty.' });
    }
    updateData.username = username.trim();
  }
  if (bio !== undefined) {
    updateData.bio = bio && typeof bio === 'string' ? bio.trim() : null;
  }
  if (pfp !== undefined) {
    updateData.pfp = pfp; // base64 string or null
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });
    res.json(updatedUser);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Username is already taken.' });
    }
    throw err;
  }
}));

// Follow/Unfollow a user
app.post('/api/users/:id/follow', asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const followerId = req.userId;

  if (!followerId) {
    return res.status(401).json({ error: 'Authentication required. Please select or create a user profile first.' });
  }

  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid user ID format.' });
  }

  if (followerId === targetId) {
    return res.status(400).json({ error: 'You cannot follow or unfollow yourself.' });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User to follow not found.' });
  }

  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId: targetId
      }
    }
  });

  if (existingFollow) {
    // Unfollow
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetId
        }
      }
    });
    res.json({ following: false });
  } else {
    // Follow
    await prisma.follow.create({
      data: {
        followerId,
        followingId: targetId
      }
    });
    res.json({ following: true });
  }
}));

// ==========================================
// POST ENDPOINTS
// ==========================================

// Get all posts (reverse-chronological)
app.get('/api/posts', asyncHandler(async (req, res) => {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pfp: true
        }
      },
      _count: {
        select: {
          comments: true,
          likes: true
        }
      },
      likes: req.userId ? {
        where: { userId: req.userId }
      } : false
    }
  });

  const formattedPosts = posts.map(post => ({
    id: post.id,
    content: post.content,
    image: post.image,
    createdAt: post.createdAt,
    user: post.user,
    stats: {
      comments: post._count.comments,
      likes: post._count.likes
    },
    hasLiked: req.userId ? post.likes.length > 0 : false
  }));

  res.json(formattedPosts);
}));

// Create a new post
app.post('/api/posts', asyncHandler(async (req, res) => {
  const { content, image } = req.body;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required. Please select or create a user profile first.' });
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Post content cannot be empty.' });
  }

  const post = await prisma.post.create({
    data: {
      content: content.trim(),
      image: image || null,
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pfp: true
        }
      }
    }
  });

  res.status(201).json({
    ...post,
    stats: { comments: 0, likes: 0 },
    hasLiked: false
  });
}));

// Like/Unlike a post
app.post('/api/posts/:id/like', asyncHandler(async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required. Please select or create a user profile first.' });
  }

  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format.' });
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const existingLike = await prisma.like.findUnique({
    where: {
      userId_postId: {
        userId,
        postId
      }
    }
  });

  if (existingLike) {
    // Unlike
    await prisma.like.delete({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });
    res.json({ liked: false });
  } else {
    // Like
    await prisma.like.create({
      data: {
        userId,
        postId
      }
    });
    res.json({ liked: true });
  }
}));

// ==========================================
// COMMENT ENDPOINTS
// ==========================================

// Get comments for a post (nested tree structure)
app.get('/api/posts/:id/comments', asyncHandler(async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  
  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format.' });
  }

  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pfp: true
        }
      }
    }
  });

  // Construct comments tree structure
  const commentMap = {};
  const rootComments = [];

  comments.forEach(comment => {
    commentMap[comment.id] = { ...comment, replies: [] };
  });

  comments.forEach(comment => {
    const mappedComment = commentMap[comment.id];
    if (comment.parentId) {
      const parent = commentMap[comment.parentId];
      if (parent) {
        parent.replies.push(mappedComment);
      } else {
        // Fallback: If parent comment wasn't found in this post, display as top level
        rootComments.push(mappedComment);
      }
    } else {
      rootComments.push(mappedComment);
    }
  });

  res.json(rootComments);
}));

// Create a comment or nested reply
app.post('/api/posts/:id/comments', asyncHandler(async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = req.userId;
  const { content, parentId } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required. Please select or create a user profile first.' });
  }

  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format.' });
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Comment content cannot be empty.' });
  }

  // Verify post exists
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  // If a parent comment is specified, verify it exists and belongs to the same post
  let parsedParentId = null;
  if (parentId) {
    parsedParentId = parseInt(parentId, 10);
    if (isNaN(parsedParentId)) {
      return res.status(400).json({ error: 'Invalid parent comment ID format.' });
    }

    const parentComment = await prisma.comment.findUnique({ where: { id: parsedParentId } });
    if (!parentComment) {
      return res.status(404).json({ error: 'Parent comment not found.' });
    }
    if (parentComment.postId !== postId) {
      return res.status(400).json({ error: 'Parent comment must belong to the same post.' });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      userId,
      postId,
      parentId: parsedParentId
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pfp: true
        }
      }
    }
  });

  res.status(201).json(comment);
}));

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
