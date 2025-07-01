import { fetch } from '@tauri-apps/api/http';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1>Study Tracker</h1>
    <button id="fetchProjects">Fetch Projects</button>
    <div id="projectsOutput"></div>
  `;

  document.getElementById('fetchProjects').addEventListener('click', async () => {
    const outputDiv = document.getElementById('projectsOutput');
    outputDiv.innerHTML = 'Fetching projects...';
    try {
      console.log('Attempting to fetch projects from http://localhost:8080/api/projects');
      const response = await fetch('http://localhost:8080/api/projects', {
        method: 'GET',
        timeout: 30, // 30 seconds timeout
      });
      console.log('Fetch response status:', response.status);
      console.log('Fetch response ok:', response.ok);
      console.log('Fetch response data:', response.data);

      if (response.ok) {
        const projects = response.data; // data is already parsed if content-type is application/json
        if (projects && projects.length > 0) {
          outputDiv.innerHTML = '<h2>Projects:</h2><ul>' +
                                projects.map(p => `<li>${p.name} (ID: ${p.id})</li>`).join('') +
                                '</ul>';
        } else {
          outputDiv.innerHTML = 'No projects found or empty response.';
        }
      } else {
        outputDiv.innerHTML = `Error fetching projects: ${response.status} - ${JSON.stringify(response.data)}`;
      }
    } catch (error) {
      console.error('Error during fetch:', error);
      outputDiv.innerHTML = `Error fetching projects: ${error.toString()}`;
      if (error.message && error.message.includes("NetworkError")) {
        outputDiv.innerHTML += "<br/>Possible reasons: Backend not running, CORS issue, or network problem. Ensure backend is running on http://localhost:8080 and tauri.conf.json allows this URL.";
      }
    }
  });
});

