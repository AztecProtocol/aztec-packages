#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <command> [args...]\n", argv[0]);
        return 1;
    }

    // Fork to create the child process
    pid_t pid = fork();
    if (pid < 0) {
        perror("fork failed");
        return 1;
    }

    if (pid == 0) {
        // In child process
        // Create a new process group for the child and its descendants
        if (setpgid(0, 0) < 0) {
            perror("setpgid failed");
            exit(1);
        }

        // Execute the target command
        setenv("DEBIAN_FRONTEND", "noninteractive", 1);
        execvp(argv[1], &argv[1]);
        perror("execvp failed");
        exit(1);
    }

    // Wait for the child process to exit
    int status;
    waitpid(pid, &status, 0);

    // Cleanup: Kill all processes in the child's process group
    if (pid > 0) {
        // Kill all processes in the child's process group
        kill(-pid, SIGKILL); // Negative PGID targets the group
    }

    return WEXITSTATUS(status);
}
