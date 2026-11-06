# SearchBook

SearchBook is a DNS Look up page where you are able to put in any domain you are
interested in and it will give you back information about where the domain server
is located, approximate distance it traveled within Fiber Optic cables, and the
time it takes to get there.
It basically makes the internet's physical infrastructure visible and 
understandable and serves as both a practical tool and an educational resource.

To be able to run this, you must have an API key to be able to run the chatbot
AI on the website. This chatbot users can use to further understand what DNS
features are, specifically for users who are not familiar with networking terms.

## External Requirements/Setup

In order to build this project you first have to install:

-   pip install -r Requirements.txt

This command should work for Windows. For MAC/Linux use:

-   python3 pip install -r Requirements.txt

There should also be an .env file that contains the API Key and Firebase login 
information to be able to run this locally.

## Running

After installing the required libraries, you would just need to run:

-   python backend.py

For MAC/Linux:

-   python3 backend.py

Then you would need to visit localhost:5000 to be able to view the website locally.

# Authors

Farnaz (Teddy) Bazyar - bazyarf@etown.edu
Ryder Paulus - paulusr@etown.edu
Chase Dornblaser - dornblaserc@etown.edu
