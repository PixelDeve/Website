// modules/posts.js

import { db } from './firebase.js';
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

    if (snapshot.empty) {
      postFeed.innerHTML = '<p class="text-center text-gray-500 mt-10">No posts yet. Be the first!</p>';
    }
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
        downvotes: 0,
        commentsCount: 0
      });
      postInput.value = '';
      await loadPosts();
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
    <h3 class="text-xl font-semibold mb-2">${escapeHtml(post.content)}</h3>
    <div class="flex space-x-4">
      <button class="upvoteBtn" data-id="${id}">⬆️ ${post.upvotes}</button>
      <button class="downvoteBtn" data-id="${id}">⬇️ ${post.downvotes}</button>
      <button class="commentBtn" data-id="${id}">💬 ${post.commentsCount}</button>
      <button class="shareBtn" data-id="${id}">🔗 Share</button>
    </div>
  `;

  el.querySelector('.upvoteBtn').addEventListener('click', () => vote(id, 'upvotes'));
  el.querySelector('.downvoteBtn').addEventListener('click', () => vote(id, 'downvotes'));
  el.querySelector('.commentBtn').addEventListener('click', () => openComments(id));
  el.querySelector('.shareBtn').addEventListener('click', () => sharePost(id));

  return el;
}

async function vote(postId, type) {
  const votedKey = `${type}_${postId}`;
  if (localStorage.getItem(votedKey)) {
    alert(`You already ${type === 'upvotes' ? 'upvoted' : 'downvoted'} this post!`);
    return;
  }

  try {
    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, { [type]: increment(1) });
    localStorage.setItem(votedKey, 'true');
    await loadPosts();
  } catch (e) {
    alert('Failed to vote: ' + e.message);
  }
}

async function openComments(postId) {
  // Find the post element
  const postElement = [...postFeed.children].find(el =>
    el.querySelector('.commentBtn').getAttribute('data-id') === postId
  );
  if (!postElement) return;

  // Toggle comments section
  let commentsSection = postElement.querySelector('.commentsSection');
  if (commentsSection) {
    commentsSection.remove();
    return;
  }

  commentsSection = document.createElement('div');
  commentsSection.className = 'commentsSection mt-4 p-4 bg-gray-50 rounded';
  commentsSection.innerHTML = '<p>Loading comments...</p>';
  postElement.appendChild(commentsSection);

  try {
    const commentsCol = collection(db, "posts", postId, "comments");
    const q = query(commentsCol, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      commentsSection.innerHTML = '<p class="text-gray-500">No comments yet.</p>';
    } else {
      commentsSection.innerHTML = '';
      snapshot.forEach(docSnap => {
        const comment = docSnap.data();
        const commentEl = document.createElement('div');
        commentEl.className = 'border-b border-gray-300 py-2';
        commentEl.textContent = comment.text || "(Empty comment)";
        commentsSection.appendChild(commentEl);
      });
    }

    // Add comment form
    const commentForm = document.createElement('form');
    commentForm.className = 'mt-4 flex space-x-2';
    commentForm.innerHTML = `
      <input type="text" placeholder="Write a comment..." required class="flex-grow p-2 border border-gray-300 rounded" />
      <button type="submit" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 rounded">Send</button>
    `;
    commentsSection.appendChild(commentForm);

    commentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const input = commentForm.querySelector('input');
      const text = input.value.trim();
      if (!text) return;

      try {
        await addDoc(collection(db, "posts", postId, "comments"), {
          text,
          createdAt: serverTimestamp()
        });

        // Increment commentsCount on post
        const postRef = doc(db, "posts", postId);
        await updateDoc(postRef, { commentsCount: increment(1) });

        input.value = '';
        openComments(postId); // Refresh comments
      } catch (error) {
        alert('Failed to add comment: ' + error.message);
      }
    });

  } catch (error) {
    commentsSection.innerHTML = `<p class="text-red-500">Failed to load comments: ${error.message}</p>`;
  }
}

function sharePost(postId) {
  const url = `${window.location.origin}?postId=${postId}`;
  navigator.clipboard.writeText(url)
    .then(() => alert('Link copied to clipboard!'))
    .catch(() => alert('Failed to copy link.'));
}

// Simple HTML escape for content (to prevent injection)
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function(m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m];
  });
}
