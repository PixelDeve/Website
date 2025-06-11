// scripts/main.js
import { initializeFirebase } from '../modules/firebase.js';
import { loadPosts, handleNewPost, loadSinglePost } from '../modules/posts.js';

// Initialize Firebase
initializeFirebase();

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('postId');
  if (postId) {
    loadSinglePost(postId);
  } else {
    loadPosts();
    handleNewPost();
  }
});
