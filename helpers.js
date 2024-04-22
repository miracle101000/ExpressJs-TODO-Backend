export function replaceFilenameWithUsername(filename, username) {
    // Split the filename at the dot
    const parts = filename.split(".");

    // Replace the first part (filename without extension) with the username
    parts[0] = username;

    // Join the parts back together with a dot
    return parts.join(".");
}