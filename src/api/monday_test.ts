import axios from 'axios';

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
        columns {
          id
          title
          type
        }
        items {
          id
          name
          column_values {
            id
            title
            text
            value
            type
          }
          subitems {
            id
            name
            column_values {
              id
              title
              text
              value
              type
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(API_URL, { query }, { headers });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error fetching board data:', error);
  }
}

fetchBoardData(); 