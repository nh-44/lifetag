
// This file provides connection to MongoDB Atlas using Data API
// For production, you should use a backend API instead of direct connection

// MongoDB Atlas Data API config
const DATA_API_URL = 'https://data.mongodb-api.com/app/data-api/endpoint/data/v1';
const DATA_API_KEY = ''; // You'll need to add your Data API key here
const DATA_SOURCE = 'Cluster0'; // Your Atlas cluster name

// Database and collection names
const DB_NAME = 'lifetag';
export const COLLECTIONS = {
  USERS: 'users',
  DOCTORS: 'doctors',
  FIRST_RESPONDERS: 'firstResponders',
};

// Flag to determine if we should use mock data or attempt real MongoDB connection
const USE_MOCK_DATA = !DATA_API_KEY;

// Mock database implementation for development or when Data API key is not provided
const mockDb = {
  collection: (name: string) => ({
    findOne: async (query = {}) => null,
    find: async (query = {}) => [],
    updateOne: async (query = {}, update = {}, options = {}) => ({ modifiedCount: 0, upsertedId: null }),
    deleteOne: async (query = {}) => ({ deletedCount: 0 }),
    insertOne: async (doc: any) => ({ insertedId: 'mock-id', ...doc }),
  }),
  command: async (command: any) => ({ ok: 1 }),
};

/**
 * Make a request to MongoDB Data API
 */
async function dataApiRequest(action: string, collection: string, data: any = {}) {
  if (USE_MOCK_DATA) {
    console.log('Using mock data (no Data API key provided)');
    return null;
  }

  try {
    const response = await fetch(`${DATA_API_URL}/action/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': DATA_API_KEY,
      },
      body: JSON.stringify({
        dataSource: DATA_SOURCE,
        database: DB_NAME,
        collection,
        ...data,
      }),
    });

    if (!response.ok) {
      throw new Error(`MongoDB Data API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('MongoDB Data API request failed:', error);
    return null;
  }
}

/**
 * Connect to MongoDB (either real or mock)
 */
export const connectToDatabase = async () => {
  if (USE_MOCK_DATA) {
    console.log('Using mock MongoDB connection');
    return mockDb;
  }

  console.log('Connecting to MongoDB Atlas using Data API');
  // With Data API, there's no persistent connection needed
  return {
    collection: (name: string) => ({
      findOne: async (query = {}) => {
        const result = await dataApiRequest('findOne', name, { filter: query });
        return result?.document || null;
      },
      find: async (query = {}) => {
        const result = await dataApiRequest('find', name, { filter: query });
        return result?.documents || [];
      },
      updateOne: async (
        query: Record<string, any> = {}, 
        update: Record<string, any> = {}, 
        options: { upsert?: boolean } = {}  // ✅ Define type explicitly
    ) => {
        const result = await dataApiRequest('updateOne', name, { 
            filter: query, 
            update: { $set: update }, 
            upsert: options.upsert ?? false  // ✅ TypeScript now recognizes `upsert`
        });
    
        return {
            modifiedCount: result?.modifiedCount || 0,
            upsertedId: result?.upsertedId || null
        };
    },    
      deleteOne: async (query = {}) => {
        const result = await dataApiRequest('deleteOne', name, { filter: query });
        return { deletedCount: result?.deletedCount || 0 };
      },
      insertOne: async (doc: any) => {
        const result = await dataApiRequest('insertOne', name, { document: doc });
        return { 
          insertedId: result?.insertedId || 'failed',
          ...doc 
        };
      },
    }),
    command: async (command: any) => {
      // Basic command support
      return { ok: 1 };
    },
  };
};

/**
 * Get MongoDB database instance
 */
export const getDatabase = async () => {
  return await connectToDatabase();
};

/**
 * Close MongoDB connection
 */
export const closeConnection = async () => {
  // No actual connection to close with Data API
  console.log('No connection to close with Data API');
  return true;
};
