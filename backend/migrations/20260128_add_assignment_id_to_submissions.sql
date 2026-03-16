ALTER TABLE submissions ADD COLUMN assignment_id INTEGER REFERENCES assignments(id);
