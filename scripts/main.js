// main.js

import { initializeFirebase, auth, provider } from './modules/firebase.js';
import { loadPosts, handleNewPost, loadSinglePost } from './modules/posts.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

// Initialize Firebase
initializeFirebase();

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userDisplay = document.getElementById('userDisplay');
  const postForm = document.getElementById('postForm');

  // Handle authentication state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userDisplay.textContent = user.displayName || user.email;
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      postForm.classList.remove('hidden');
    } else {
      userDisplay.textContent = '';
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      postForm.classList.add('hidden');
    }
  });

  // Sign in
  loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch((error) => {
      alert(`Failed to sign in: ${error.message}`);
    });
  });

  // Sign out
  logoutBtn.addEventListener('click', () => {
    signOut(auth).catch((error) => {
      alert(`Failed to sign out: ${error.message}`);
    });
  });

  // Determine which view to load
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('postId');

  if (postId) {
    loadSinglePost(postId);
  } else {
    loadPosts();
    handleNewPost();
  }
});
