// Select the button and menu elements
const button = document.querySelector('.menu-button');
const menu = document.querySelector('.menu');

// Add click event listener to the button
button.addEventListener('click', () => {
  menu.classList.toggle('show'); // Toggle 'show' class to display/hide menu
});   