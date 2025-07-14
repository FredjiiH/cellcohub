const axios = require('axios');

const API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjUzODY0MTQ5MCwiYWFpIjoxMSwidWlkIjo3MjM2MzUxOCwiaWFkIjoiMjAyNS0wNy0xNFQwOTo1Mzo1Ny4wMjZaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjAwNDIyNTEsInJnbiI6ImV1YzEifQ.e1BMyuqkZPwrnzQjqnJgoDORiLZ5LT33jlCPOAK3i3g';
const BOARD_ID = '2038576678';
const API_URL = 'https://api.monday.com/v2';

const headers = {
  'Authorization': API_TOKEN,
  'Content-Type': 'application/json',
};

async function fetchBoardData() {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        id
        name
        items_page {
          items {
            id
            name
            column_values {
              id
              text
              value
              type
            }
            subitems {
              id
              name
              column_values {
                id
                text
                value
                type
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(API_URL, { query }, { headers });
    if (response.data.errors) {
      console.error('API Errors:', JSON.stringify(response.data.errors, null, 2));
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('API Error Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error fetching board data:', error);
    }
  }
}

fetchBoardData(); 