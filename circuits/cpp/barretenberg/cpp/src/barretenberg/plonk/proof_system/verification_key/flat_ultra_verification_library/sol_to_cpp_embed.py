import sys

if len(sys.argv) != 2:
    print("Usage: python sol_to_cpp_embed.py <filename>")
    sys.exit(1)

filename = sys.argv[1]

with open(filename, 'r') as file:
    content = file.read()

# Escape special characters
escaped_content = content.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")

print(f"static const char* embedded_file_content = \"{escaped_content}\";")
