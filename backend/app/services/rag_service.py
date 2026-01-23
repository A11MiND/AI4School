import os
from llama_index.core import VectorStoreIndex, Document
from llama_index.core.node_parser import SentenceSplitter

class RAGService:
    def __init__(self):
        # In a real expanded version, we might persist this to disk (ChromaDB)
        # For now, we build the index in memory for the session or task.
        self.index = None

    def create_index_from_text(self, text_content: str):
        """
        Ingests raw text (from extracted PDF/Word), chunks it, 
        and creates a searchable vector index.
        """
        if not text_content:
            return False
            
        print(f"DEBUG: Indexing text of length {len(text_content)}...")
        
        # Create a Document object
        document = Document(text=text_content)
        
        # Parse logic (chunking)
        parser = SentenceSplitter(chunk_size=1024, chunk_overlap=20)
        nodes = parser.get_nodes_from_documents([document])
        
        # Build Index (uses OpenAI Embeddings by default if env key is set)
        # Since we use DeepSeek for generation, we might want to check
        # if the user has OpenAI key for embeddings, or swap to HuggingFace embeddings.
        # For MVP, we assume OPENAI_API_KEY is present for embeddings.
        self.index = VectorStoreIndex(nodes)
        print("DEBUG: Index successfully created.")
        return True

    def query_context(self, query: str):
        """
        Retrieves relevant text snippets based on a query.
        Used to feed the 'Context' to the exam generator AI.
        """
        if not self.index:
            return "Error: No document indexed."
        
        # Retrieve top 3 relevant chunks
        retriever = self.index.as_retriever(similarity_top_k=3)
        nodes = retriever.retrieve(query)
        
        # Combine into a single string context
        context_str = "\n\n".join([n.get_content() for n in nodes])
        return context_str

rag_service = RAGService()