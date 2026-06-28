export type MessageSender = "me" | "seller";

export type ChatMessage = {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
};

export type ConversationProduct = {
  id: string;
  href?: string;
  name: string;
  price: string;
  image: string;
  status: "Available" | "Pending" | "Sold" | "Service";
};

export type Conversation = {
  id: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatar: string;
  sellerImage?: string;
  campus: string;
  category: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  online: boolean;
  product: ConversationProduct;
  messages: ChatMessage[];
};

export const conversations: Conversation[] = [
  {
    id: "chat-tasty-bowl",
    sellerName: "Tasty Bowl",
    sellerUsername: "tasty-bowl",
    sellerAvatar: "T",
    campus: "FUPRE",
    category: "Food Vendor",
    lastMessage: "Yes, delivery is available around Hostel area.",
    lastMessageTime: "2m",
    unreadCount: 2,
    online: true,
    product: {
      id: "jollof-rice-combo",
      name: "Jollof Rice Combo",
      price: "₦2,500",
      image:
        "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
      status: "Available",
    },
    messages: [
      {
        id: "m1",
        sender: "seller",
        text: "Hello, welcome to Tasty Bowl. What would you like to order?",
        time: "10:22 AM",
      },
      {
        id: "m2",
        sender: "me",
        text: "Hi, is the Jollof Rice Combo still available?",
        time: "10:23 AM",
      },
      {
        id: "m3",
        sender: "seller",
        text: "Yes, it is available. We also have chicken and plantain with it.",
        time: "10:24 AM",
      },
      {
        id: "m4",
        sender: "me",
        text: "Can you deliver to Hostel area?",
        time: "10:25 AM",
      },
      {
        id: "m5",
        sender: "seller",
        text: "Yes, delivery is available around Hostel area.",
        time: "10:26 AM",
      },
    ],
  },
  {
    id: "chat-campus-wears",
    sellerName: "Campus Wears",
    sellerUsername: "campus-wears",
    sellerAvatar: "C",
    campus: "FUPRE",
    category: "Fashion Store",
    lastMessage: "The hoodie is available in black and ash.",
    lastMessageTime: "18m",
    unreadCount: 0,
    online: true,
    product: {
      id: "premium-campus-hoodie",
      name: "Premium Campus Hoodie",
      price: "₦12,000",
      image:
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
      status: "Available",
    },
    messages: [
      {
        id: "m1",
        sender: "seller",
        text: "The hoodie is available in black and ash.",
        time: "9:48 AM",
      },
      {
        id: "m2",
        sender: "me",
        text: "Do you have medium size?",
        time: "9:49 AM",
      },
      {
        id: "m3",
        sender: "seller",
        text: "Yes, medium size is available.",
        time: "9:50 AM",
      },
    ],
  },
  {
    id: "chat-gadget-fix",
    sellerName: "Gadget Fix",
    sellerUsername: "gadget-fix",
    sellerAvatar: "G",
    campus: "FUPRE",
    category: "Phone Repair",
    lastMessage: "Screen replacement takes about 45 minutes.",
    lastMessageTime: "1h",
    unreadCount: 1,
    online: false,
    product: {
      id: "phone-repair",
      name: "Phone Repair Service",
      price: "From ₦3,000",
      image:
        "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?auto=format&fit=crop&w=900&q=80",
      status: "Service",
    },
    messages: [
      {
        id: "m1",
        sender: "me",
        text: "How long does screen replacement take?",
        time: "8:30 AM",
      },
      {
        id: "m2",
        sender: "seller",
        text: "Screen replacement takes about 45 minutes.",
        time: "8:34 AM",
      },
    ],
  },
  {
    id: "chat-book-hub",
    sellerName: "Book Hub",
    sellerUsername: "book-hub",
    sellerAvatar: "B",
    campus: "FUPRE",
    category: "Books",
    lastMessage: "I can reserve the textbook for you till evening.",
    lastMessageTime: "Yesterday",
    unreadCount: 0,
    online: false,
    product: {
      id: "engineering-maths-textbook",
      name: "Engineering Mathematics Textbook",
      price: "₦4,500",
      image:
        "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80",
      status: "Pending",
    },
    messages: [
      {
        id: "m1",
        sender: "seller",
        text: "I can reserve the textbook for you till evening.",
        time: "Yesterday",
      },
    ],
  },
];
