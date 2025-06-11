// modules/posts.js

import { db, auth } from './firebase.js';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const postFeed = document.getElementById('postFeed');
const postInput = document.getElementById('postInput');
const postForm = document.getElementById('postForm');

export async function loadPosts() {
  postFeed.innerHTML = '<p class="text-center text-gray-500 mt-10">Loading posts...</p>';

  try {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    postFeed.innerHTML = '';

    snapshot.forEach(docSnap => {
      const post = docSnap.data();
      postFeed.appendChild(createPostElement(docSnap.id, post));
    });
  } catch (e) {
    postFeed.innerHTML = `<p class="text-red-500 mt-10">Failed to load posts: ${e.message}</p>`;
  }
}

export function handleNewPost() {
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = postInput.value.trim();
    if (!content) return alert('Cannot post empty content!');

    postForm.querySelector('button').disabled = true;
    try {
      await addDoc(collection(db, "posts"), {
        content,
        createdAt: serverTimestamp(),
        upvotes: 0,
        downvotes: 0
      });
      postInput.value = '';
      loadPosts();
    } catch (e) {
      alert('Failed to add post: ' + e.message);
    }
    postForm.querySelector('button').disabled = false;
  });
}

function createPostElement(id, post) {
  const el = document.createElement('article');
  el.className = "bg-white rounded-lg shadow-lg p-6 mb-6 hover:bg-gray-50 transition-colors";
  el.innerHTML = `
    <h3 class="text-xl font-semibold mb-2">${post.content}</h3>
    <div class="flex space-x-4 mb-4">
      <button class="upvoteBtn" data-id="${id}">⬆️ ${post.upvotes}</button>
      <button class="downvoteBtn" data-id="${id}">⬇️ ${post.downvotes}</button>
      <button class="shareBtn" data-id="${id}">🔗 Share</button>
    </div>
    <div class="comments mt-4 space-y-4">
      <div class="addComment">
        <textarea placeholder="Write a comment..." class="commentInput w-full p-2 rounded-md border border-gray-300"></textarea>
        <button class="submitComment mt-2 bg-indigo-500 text-white px-3 py-1 rounded-md">Add Comment</button>
      </div>
      <div class="commentList space-y-2"></div>
    </div>
  `;

  el.querySelector('.upvoteBtn').addEventListener('click', () => votePost(id, 'upvotes'));
  el.querySelector('.downvoteBtn').addEventListener('click', () => votePost(id, 'downvotes'));
  el.querySelector('.shareBtn').addEventListener('click', () => sharePost(id));

  // Comment handlers
  const submitCommentBtn = el.querySelector('.submitComment');
  const commentInput = el.querySelector('.commentInput');
  submitCommentBtn.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) return alert('Cannot post empty comment!');
    await addComment(id, content, null);
    commentInput.value = '';
    loadComments(id, el.querySelector('.commentList'));
  });

  loadComments(id, el.querySelector('.commentList'));
  return el;
}

async function votePost(postId, type) {
  const votedKey = `${type}_${postId}`;
  if (localStorage.getItem(votedKey)) {
    alert(`You already ${type === 'upvotes' ? 'upvoted' : 'downvoted'} this post!`);
    return;
  }

  try {
    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, { [type]: increment(1) });
    localStorage.setItem(votedKey, 'true');
    loadPosts();
  } catch (e) {
    alert('Failed to vote: ' + e.message);
  }
}

async function addComment(postId, content, parentId = null) {
  const commentData = {
    content,
    createdAt: serverTimestamp(),
    upvotes: 0,
    downvotes: 0,
    parentId
  };
  try {
    await addDoc(collection(db, "posts", postId, "comments"), commentData);
  } catch (e) {
    alert('Failed to add comment: ' + e.message);
  }
}

async function loadComments(postId, container, parentId = null, level = 0) {
  container.innerHTML = '<p class="text-gray-500">Loading comments...</p>';

  try {
    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    snapshot.forEach(docSnap => {
      const comment = docSnap.data();
      if (comment.parentId === parentId) {
        container.appendChild(createCommentElement(postId, docSnap.id, comment, level));
      }
    });
  } catch (e) {
    container.innerHTML = `<p class="text-red-500">Failed to load comments: ${e.message}</p>`;
  }
}

function createCommentElement(postId, commentId, comment, level) {
  const el = document.createElement('div');
  el.className = `ml-${level * 4} p-2 border rounded-md bg-gray-50`;
  el.innerHTML = `
    <p>${comment.content}</p>
    <div class="flex space-x-2 mt-1">
      <button class="upvoteCommentBtn text-sm" data-id="${commentId}">⬆️ ${comment.upvotes}</button>
      <button class="downvoteCommentBtn text-sm" data-id="${commentId}">⬇️ ${comment.downvotes}</button>
      <button class="replyBtn text-sm text-indigo-500">Reply</button>
    </div>
    <div class="replyBox mt-2 hidden">
      <textarea class="replyInput w-full p-2 rounded-md border border-gray-300" placeholder="Write a reply..."></textarea>
      <button class="submitReply mt-2 bg-indigo-500 text-white px-3 py-1 rounded-md">Reply</button>
    </div>
    <div class="nestedComments mt-2 space-y-2"></div>
  `;

  // Event listeners
  el.querySelector('.upvoteCommentBtn').addEventListener('click', () => voteComment(postId, commentId, 'upvotes'));
  el.querySelector('.downvoteCommentBtn').addEventListener('click', () => voteComment(postId, commentId, 'downvotes'));
  el.querySelector('.replyBtn').addEventListener('click', () => {
    el.querySelector('.replyBox').classList.toggle('hidden');
  });
  el.querySelector('.submitReply').addEventListener('click', async () => {
    const replyInput = el.querySelector('.replyInput');
    const content = replyInput.value.trim();
    if (!content) return alert('Cannot post empty reply!');
    await addComment(postId, content, commentId);
    replyInput.value = '';
    loadComments(postId, el.querySelector('.nestedComments'), commentId, level + 1);
  });

  // Load nested comments
  loadComments(postId, el.querySelector('.nestedComments'), commentId, level + 1);
  return el;
}

async function voteComment(postId, commentId, type) {
  const votedKey = `comment_${type}_${commentId}`;
  if (localStorage.getItem(votedKey)) {
    alert(`You already ${type === 'upvotes' ? 'upvoted' : 'downvoted'} this comment!`);
    return;
  }

  try {
    const commentRef = doc(db, "posts", postId, "comments", commentId);
    await updateDoc(commentRef, { [type]: increment(1) });
    localStorage.setItem(votedKey, 'true');
    loadPosts();
  } catch (e) {
    alert('Failed to vote: ' + e.message);
  }
}

function sharePost(postId) {
  const url = `${window.location.origin}?postId=${postId}`;
  navigator.clipboard.writeText(url)
    .then(() => alert('Link copied to clipboard!'))
    .catch(err => alert('Failed to copy link.'));
                               }
