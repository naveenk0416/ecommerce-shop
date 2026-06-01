with open("src/app/app.ts", "r") as f:
    content = f.read()

content = content.replace("const url = window.location.href;", "const currentUrl = window.location.href;", 1)
content = content.replace("url.includes('/admin')", "currentUrl.includes('/admin')", 1)

content = content.replace("const url = window.location.href;", "const locUrl = window.location.href;", 1)
content = content.replace("url.includes('/products')", "locUrl.includes('/products')", 1)

with open("src/app/app.ts", "w") as f:
    f.write(content)
