// main.js

import { initializeFirebase, auth, provider } from './modules/firebase.js';
import { loadPosts, handleNewPost } from './modules/posts.js';
import {
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

// Initialize Firebase
initializeFirebase();

// Load posts when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  handleNewPost();

  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log('Signed in as:', user.displayName);
        signInBtn.style.display = 'none'; // Hide the sign-in button after successful sign-in
        alert(`Signed in as ${user.displayName}`);
      } catch (error) {
        console.error('Sign-in failed:', error);
        alert('Sign-in failed. Please check console.');
      }
    });
  }

  // Automatically check authentication state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('User is signed in:', user.displayName);
      if (signInBtn) signInBtn.style.display = 'none'; // Hide button if already signed in
    } else {
      console.log('No user is signed in.');
      if (signInBtn) signInBtn.style.display = 'block'; // Show button if no user is signed in
    }
  });
});
