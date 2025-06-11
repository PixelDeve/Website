// modules/posts.js

import { db } from './firebase.js';
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
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
  if (!postForm) return;

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
      loadPosts();
    } catch (e) {
      alert('Failed to add post: ' + e.message);
    }
    postForm.querySelector('button').disabled = false;
  });
}

export async function loadSinglePost(postId) {
  postFeed.innerHTML = '<p class="text-center text-gray-500 mt-10">Loading post...</p>';

  try {
    const postRef = doc(db, "posts", postId);
    const docSnap = await getDoc(postRef);
    postFeed.innerHTML = '';

    if (docSnap.exists()) {
      const post = docSnap.data();
      postFeed.appendChild(createPostElement(docSnap.id, post, true));
    } else {
      postFeed.innerHTML = '<p class="text-red-500 mt-10">Post not found.</p>';
    }
  } catch (e) {
    postFeed.innerHTML = `<p class="text-red-500 mt-10">Failed to load post: ${e.message}</p>`;
  }
}

function createPostElement(id, post, singleView = false) {
  const el = document.createElement('article');
  el.className = "bg-white rounded-lg shadow-lg p-6 mb-6 hover:bg-gray-50 transition-colors";
  el.innerHTML = `
    <h3 class="text-xl font-semibold mb-2">${post.content}</h3>
    <div class="flex space-x-4">
      <button class="upvoteBtn" data-id="${id}">⬆️ ${post.upvotes}</button>
      <button class="downvoteBtn" data-id="${id}">⬇️ ${post.downvotes}</button>
      <button class="commentBtn" data-id="${id}">💬 ${post.commentsCount}</button>
      <button class="shareBtn" data-id="${id}">🔗 Share</button>
    </div>
    ${singleView ? `
      <section class="mt-4">
        <h4 class="text-lg font-semibold mb-2">Comments (Coming Soon!)</h4>
        <p>Comment section goes here...</p>
      </section>
    ` : ''}
  `;

  el.querySelector('.upvoteBtn').addEventListener('click', () => vote(id, 'upvotes'));
  el.querySelector('.downvoteBtn').addEventListener('click', () => vote(id, 'downvotes'));
  el.querySelector('.commentBtn').addEventListener('click', () => {
    if (singleView) {
      alert('Comments already open!');
    } else {
      window.location.href = `?postId=${id}`;
    }
  });
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
    // Refresh posts or post
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('postId')) {
      loadSinglePost(postId);
    } else {
      loadPosts();
    }
  } catch (e) {
    alert('Failed to vote: ' + e.message);
  }
}

function sharePost(postId) {
  const url = `${window.location.origin}${window.location.pathname}?postId=${postId}`;
  navigator.clipboard.writeText(url)
    .then(() => alert('Link copied to clipboard!'))
    .catch(err => alert('Failed to copy link.'));
                           }
