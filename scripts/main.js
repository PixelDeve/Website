// main.js

import { initializeFirebase } from './modules/firebase.js';
import { loadPosts, handleNewPost } from './modules/post.js';

// Initialize Firebase
initializeFirebase();

// Load posts when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  handleNewPost();
});
