#include "process.hpp"

Process::Process(const std::string& command)
{
    int stdin_pipe[2];  // NOLINT
    int stdout_pipe[2]; // NOLINT
    pid_t pid = 0;

    if (pipe(stdin_pipe) < 0 || pipe(stdout_pipe) < 0) {
        throw std::runtime_error("pipe() failed");
    }

    pid = fork();
    if (pid < 0) {
        throw std::runtime_error("fork() failed");
    }

    if (pid == 0) { // Child process
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);

        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);

        close(stdin_pipe[0]);
        close(stdout_pipe[1]);

        execl("/bin/sh", "sh", "-c", command.c_str(), nullptr); // NOLINT
        exit(1);
    }

    // Parent process
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);

    this->pid = pid;
    this->stdin_fd = stdin_pipe[1];
    this->stdout_fd = stdout_pipe[0];
}

Process::~Process()
{
    close(stdin_fd);
    close(stdout_fd);
    waitpid(pid, nullptr, 0);
}

void Process::write_line(const std::string& line) const
{
    std::string command = line + "\n";
    write(stdin_fd, command.c_str(), command.size());
}

std::string Process::read_line() const
{
    char buffer[4096]; // NOLINT
    std::string response;
    ssize_t bytes_read = 0;
    while ((bytes_read = read(stdout_fd, buffer, sizeof(buffer))) > 0) {
        response.append(buffer, static_cast<size_t>(bytes_read));
        if (response.find('\n') != std::string::npos) {
            break;
        }
    }
    return response;
}
