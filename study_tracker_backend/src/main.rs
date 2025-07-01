use study_tracker_backend_lib::handlers::run_server;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let host = "0.0.0.0";
    let port = 8080;
    println!("Starting server at http://{}:{}/", host, port);
    run_server(host.to_string(), port).await
}

