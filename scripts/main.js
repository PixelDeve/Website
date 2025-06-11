// main.js

import { initializeFirebase, auth, provider } from './modules/firebase.js';
import { loadPosts, handleNewPost } from './modules/posts.js';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

// Initialize Firebase
initializeFirebase();

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  handleNewPost();

  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const postForm = document.getElementById('postForm');
  const postFeed = document.getElementById('postFeed');
  const userDisplay = document.getElementById('userDisplay');

  // Handle login button
  loginBtn.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign-in failed:', error);
      alert('Sign-in failed. Please check console.');
    }
  });

  // Handle logout button
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out failed:', error);
      alert('Sign-out failed. Please check console.');
    }
  });

  // Monitor authentication state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User signed in
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      userDisplay.textContent = `Welcome, ${user.displayName}!`;
      postForm.classList.remove('hidden');
      loadPosts();
    } else {
      // User signed out
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      userDisplay.textContent = '';
      postForm.classList.add('hidden');
      postFeed.innerHTML = `<p class="text-center text-gray-500 mt-10">Please log in to see and add posts.</p>`;
    }
  });
});
